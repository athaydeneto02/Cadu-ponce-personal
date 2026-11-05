/**
 * mediaDb.ts
 * Armazenamento local de alta capacidade via IndexedDB para vídeos e imagens.
 * Permite anexar vídeos e fotos direto do computador sem estourar a cota de 5MB do localStorage.
 */

import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { cacheForUser, getCacheUser } from './sessionCache';
import { isPassiveMediaType, passiveDataUrl, passiveMediaSource, safeHttpUrl } from './mediaPolicy';

const DB_NAME = 'cadu_ponce_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_files';

interface MediaRecord {
  id: string;
  ownerId?: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

// Memory cache for object URLs so we don't recreate them constantly
const blobUrlCache = new Map<string, string>();
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const removedLocalFiles = new Set<string>();
const privateBuckets = new Set(['evolution-photos', 'exercise-videos', 'arquivos-alunos']);

export function toStorageReference(bucket: string, path: string): string {
  const normalized = path?.replace(/^\/+/, '');
  if (!privateBuckets.has(bucket) || !validStoragePath(normalized)) throw new Error('Arquivo inválido.');
  return `storage://${bucket}/${normalized}`;
}

function storageLocation(value: string): { bucket: string; path: string } | null {
  const durable = value.match(/^storage:\/\/([^/]+)\/(.+)$/);
  if (durable && privateBuckets.has(durable[1])) return { bucket: durable[1], path: durable[2] };
  // Old public URLs must still work after the bucket becomes private.
  try {
    const url = new URL(value);
    const projectUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!projectUrl || url.origin !== new URL(projectUrl).origin) return null;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (match && privateBuckets.has(match[1])) return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch { /* local or external reference */ }
  return null;
}

function validStoragePath(path: string): boolean {
  return !!path && !path.startsWith('/') && !/[\\\u0000-\u001f]/.test(path)
    && !path.split('/').some(part => part === '..' || part === '.' || !part);
}

function legacyFileBelongsToActor(idbKey: string, actor: string): boolean {
  const contains = (value: unknown): boolean => value === idbKey || (!!value && typeof value === 'object' && Object.values(value).some(contains));
  const cache = cacheForUser(actor);
  // Old records have no owner column. Only an explicit reference in this
  // account's isolated records can recover them; never infer from a filename.
  return ['cadu_ponce_photos', 'cadu_ponce_exercise_drafts', 'cadu_ponce_exercises_v3',
    'cadu_ponce_admin_routines', 'cadu_ponce_workouts', 'cadu_deleted_photos']
    .some(key => contains(cache.readJson<unknown>(key, null)));
}

function ownsLocalRecord(record: MediaRecord, idbKey: string, actor: string): boolean {
  return record.ownerId ? record.ownerId === actor : legacyFileBelongsToActor(idbKey, actor);
}

function safeResolvedSource(value?: string | null): string {
  if (value?.startsWith('blob:')) return [...blobUrlCache.entries()].some(([key, url]) => key.startsWith(`${getCacheUser()}:`) && url === value) ? value : '';
  return passiveMediaSource(value);
}

const mediaCacheKey = (reference: string, actor = getCacheUser()) => `${actor}:${reference}`;

export function createMediaPreview(file: Blob): string {
  const actor = getCacheUser();
  if (!actor || !isPassiveMediaType(file.type)) throw new Error('Escolha uma imagem ou vídeo compatível.');
  const url = URL.createObjectURL(file);
  blobUrlCache.set(mediaCacheKey(`preview:${url}`, actor), url);
  return url;
}

export function revokeMediaPreview(url: string): void {
  blobUrlCache.delete(mediaCacheKey(`preview:${url}`));
  URL.revokeObjectURL(url);
}

/** Delete only a managed object, after its owning record has been removed.
 * External URLs and legacy embedded media have no independently owned object.
 * The bucket's RLS remains the authority for this authenticated operation.
 */
export async function deleteStoredMedia(reference: string, expectedActor = getCacheUser()): Promise<void> {
  const location = storageLocation(reference);
  if (!location) {
    if (reference.startsWith('storage://')) throw new Error('Referência de arquivo inválida.');
    return;
  }
  if (!validStoragePath(location.path)) throw new Error('Caminho de arquivo inválido.');
  if (!expectedActor || getCacheUser() !== expectedActor) throw new Error('A sessão mudou. Entre novamente.');
  const { error } = await supabase.storage.from(location.bucket).remove([location.path]);
  if (error) throw new Error('Não foi possível remover o arquivo armazenado. Tente novamente.');
  signedUrlCache.delete(`${expectedActor}:${location.bucket}/${location.path}`);
}

/** Remove an exact local file. Never clear unrelated drafts or pending uploads. */
export async function deleteLocalFile(idbKey: string, expectedActor = getCacheUser()): Promise<void> {
  if (!idbKey.startsWith('idb:') || !idbKey.slice(4)) throw new Error('Arquivo local inválido.');
  if (!expectedActor || getCacheUser() !== expectedActor) throw new Error('A sessão mudou. Entre novamente.');
  const db = await openDb();
  try {
    if (getCacheUser() !== expectedActor) throw new Error('A sessão mudou. Entre novamente.');
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(idbKey.slice(4));
      request.onsuccess = () => {
        if (getCacheUser() !== expectedActor || (request.result && !ownsLocalRecord(request.result, idbKey, expectedActor))) {
          reject(new Error('Este arquivo local pertence a outra sessão.'));
          transaction.abort?.();
          return;
        }
        store.delete(idbKey.slice(4));
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Não foi possível remover o arquivo local.'));
    });
    removedLocalFiles.add(idbKey);
    const cacheKey = mediaCacheKey(idbKey, expectedActor);
    const cached = blobUrlCache.get(cacheKey);
    if (cached?.startsWith('blob:')) URL.revokeObjectURL(cached);
    blobUrlCache.delete(cacheKey);
  } finally { db.close?.(); }
}

/** Only durable media references belong in shared exercise records. */
export function normalizeStoredMediaReference(value?: string | null): string | null {
  const reference = value?.trim();
  if (!reference) return null;
  const location = storageLocation(reference);
  if (location) return toStorageReference(location.bucket, location.path);
  if (/^supamedia:[a-zA-Z0-9_-]+$/.test(reference)) return reference;
  const http = safeHttpUrl(reference);
  if (http) return http;
  throw new Error('Envie o arquivo antes de salvar ou use um link HTTP válido. Arquivos locais não podem ser compartilhados.');
}

export function clearMediaCache(): void {
  for (const url of blobUrlCache.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  blobUrlCache.clear();
  signedUrlCache.clear();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB não suportado neste navegador'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva um arquivo (vídeo ou imagem) no IndexedDB.
 * Retorna uma chave identificadora no formato `idb:<id>`.
 */
export async function storeLocalFile(file: File | Blob, prefix = 'media'): Promise<string> {
  const actor = getCacheUser();
  if (!actor) throw new Error('Entre na sua conta antes de salvar mídia neste aparelho.');
  const db = await openDb();
  if (getCacheUser() !== actor) { db.close?.(); throw new Error('A sessão mudou. Entre novamente.'); }
  const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const record: MediaRecord = {
    id,
    ownerId: actor,
    blob: file,
    name: (file as File).name || id,
    type: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now(),
  };

  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Não foi possível salvar o arquivo neste dispositivo.'));
  }); } finally { db.close?.(); }

  if (getCacheUser() !== actor) throw new Error('A sessão mudou. O arquivo permanece na conta original.');

  // Create immediate blob URL and cache it
  const idbKey = `idb:${id}`;
  if (isPassiveMediaType(file.type)) blobUrlCache.set(mediaCacheKey(idbKey, actor), URL.createObjectURL(file));

  return idbKey;
}

/**
 * Recupera o Blob armazenado no IndexedDB.
 */
export async function getLocalBlob(idbKey: string): Promise<Blob | null> {
  const actor = getCacheUser();
  if (!actor || !idbKey.startsWith('idb:')) return null;
  if (removedLocalFiles.has(idbKey)) return null;
  const id = idbKey.replace(/^idb:/, '');
  const db = await openDb();

  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => {
      const record = req.result as MediaRecord | undefined;
      resolve(record && actor === getCacheUser() && ownsLocalRecord(record, idbKey, actor) && !removedLocalFiles.has(idbKey) ? record.blob : null);
    };
    req.onerror = () => reject(req.error);
  }).finally(() => db.close?.());
}

/**
 * Resolve qualquer URL:
 * - Se for `idb:<id>`, busca no IndexedDB e retorna uma Blob URL (`blob:http...`).
 * - URLs HTTP(S) e dados de mídia passiva são validados antes de exibir.
 */
export async function resolveMediaUrl(url: string | undefined | null): Promise<string> {
  if (typeof url !== 'string' || !url) return '';
  url = url.trim();
  const requestActor = getCacheUser();
  const location = storageLocation(url);
  if (location) {
    const actor = getCacheUser();
    if (!actor || !validStoragePath(location.path)) return '';
    const key = `${actor}:${location.bucket}/${location.path}`;
    const cached = signedUrlCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 600);
    if (error || !data?.signedUrl || !safeHttpUrl(data.signedUrl) || actor !== getCacheUser()) return '';
    signedUrlCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + 8 * 60 * 1000 });
    return data.signedUrl;
  }
  if (!url.startsWith('idb:') && !url.startsWith('supamedia:')) return safeResolvedSource(url);
  if (!requestActor) return '';

  // Check cache first
  const cached = blobUrlCache.get(mediaCacheKey(url, requestActor));
  if (cached) return cached;

  // 1. Resolve from Supabase Cloud Media
  if (url.startsWith('supamedia:')) {
    const actor = getCacheUser();
    const id = url.replace(/^supamedia:/, '');
    try {
      const { data, error } = await supabase
        .from('agenda_events')
        .select('notes')
        .eq('id', id)
        .single();

      if (!error && data?.notes) {
        let objectUrl = '';
        const embedded = typeof data.notes === 'string' ? passiveDataUrl(data.notes) : null;
        if (embedded) {
          const bstr = atob(embedded.base64);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          if (actor !== getCacheUser()) return '';
          const blob = new Blob([u8arr], { type: embedded.type });
          objectUrl = URL.createObjectURL(blob);
        } else if (typeof data.notes === 'string' && safeHttpUrl(data.notes.trim())) {
          objectUrl = await resolveMediaUrl(data.notes.trim());
        }
        if (objectUrl && actor === getCacheUser()) {
          blobUrlCache.set(mediaCacheKey(url, actor), objectUrl);
          return objectUrl;
        }
      }
    } catch (e) {
      console.warn('Erro ao resolver supamedia:', e);
    }
    return '';
  }

  // 2. Resolve from IndexedDB
  try {
    const blob = await getLocalBlob(url);
    if (!blob || !isPassiveMediaType(blob.type) || requestActor !== getCacheUser()) return '';
    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache.set(mediaCacheKey(url, requestActor), objectUrl);
    return objectUrl;
  } catch (err) {
    console.error('Erro ao resolver mídia do IndexedDB:', err);
    return '';
  }
}

/**
 * React Hook para resolver URLs de mídia que podem estar no IndexedDB (`idb:...`) ou Supabase (`supamedia:...`).
 */
export function useMediaUrl(url?: string | null): string {
  const actor = getCacheUser();
  const [resolved, setResolved] = useState(() => ({ source: url, actor, value: url && !storageLocation(url)
    ? (url.startsWith('idb:') || url.startsWith('supamedia:') ? blobUrlCache.get(mediaCacheKey(url)) || '' : safeResolvedSource(url)) : '' }));

  useEffect(() => {
    const update = (value: string) => { if (actor === getCacheUser()) setResolved({ source: url, actor, value }); };
    if (!url) {
      update('');
      return;
    }
    if (!storageLocation(url) && !url.startsWith('idb:') && !url.startsWith('supamedia:')) {
      update(safeResolvedSource(url));
      return;
    }
    const cached = storageLocation(url) ? undefined : blobUrlCache.get(mediaCacheKey(url, actor));
    if (cached) {
      update(cached);
      return;
    }

    let isMounted = true;
    const refresh = () => resolveMediaUrl(url).then(res => {
      if (isMounted) update(res);
    });
    void refresh();
    const privateMedia = !!storageLocation(url);
    const onFocus = () => { if (isMounted && actor === getCacheUser()) void refresh(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    const timer = privateMedia ? setInterval(onFocus, 9 * 60 * 1000) : undefined;
    if (privateMedia) { window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisibility); }
    return () => {
      isMounted = false; if (timer) clearInterval(timer);
      if (privateMedia) { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); }
    };
  }, [url, actor]);

  return resolved.source === url && resolved.actor === actor ? resolved.value : '';
}

/**
 * Comprime uma imagem antes de salvar para economizar espaço e evitar travamentos.
 * Redimensiona para max 800x800 e converte para JPEG 85%.
 */
export async function compressImage(file: File, maxDim = 800, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;

    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Private/local media resolves under the active identity. External videos are
 * played directly by <video>, without fetching untrusted content into an
 * application-origin blob or a shared IndexedDB cache. */
export async function getCachedVideoBlobUrl(url: string): Promise<string> {
  return resolveMediaUrl(url);
}

