/**
 * mediaDb.ts
 * Armazenamento local de alta capacidade via IndexedDB para vídeos e imagens.
 * Permite anexar vídeos e fotos direto do computador sem estourar a cota de 5MB do localStorage.
 */

import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { getCacheUser } from './sessionCache';

const DB_NAME = 'cadu_ponce_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_files';

interface MediaRecord {
  id: string;
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
  if (!privateBuckets.has(bucket) || !path || path.split('/').includes('..')) throw new Error('Arquivo inválido.');
  return `storage://${bucket}/${path.replace(/^\/+/, '')}`;
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
      transaction.objectStore(STORE_NAME).delete(idbKey.slice(4));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Não foi possível remover o arquivo local.'));
    });
    removedLocalFiles.add(idbKey);
    const cached = blobUrlCache.get(idbKey);
    if (cached?.startsWith('blob:')) URL.revokeObjectURL(cached);
    blobUrlCache.delete(idbKey);
  } finally { db.close?.(); }
}

/** Only durable media references belong in shared exercise records. */
export function normalizeStoredMediaReference(value?: string | null): string | null {
  const reference = value?.trim();
  if (!reference) return null;
  const location = storageLocation(reference);
  if (location) return toStorageReference(location.bucket, location.path);
  if (/^supamedia:[a-zA-Z0-9_-]+$/.test(reference)) return reference;
  try {
    const url = new URL(reference);
    if (url.protocol === 'https:' || url.protocol === 'http:') return reference;
  } catch { /* reject local references and incomplete URLs */ }
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
  const db = await openDb();
  const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const record: MediaRecord = {
    id,
    blob: file,
    name: (file as File).name || id,
    type: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Não foi possível salvar o arquivo neste dispositivo.'));
  });

  // Create immediate blob URL and cache it
  const url = URL.createObjectURL(file);
  const idbKey = `idb:${id}`;
  blobUrlCache.set(idbKey, url);

  return idbKey;
}

/**
 * Recupera o Blob armazenado no IndexedDB.
 */
export async function getLocalBlob(idbKey: string): Promise<Blob | null> {
  if (removedLocalFiles.has(idbKey)) return null;
  const id = idbKey.replace(/^idb:/, '');
  const db = await openDb();

  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => {
      const record = req.result as MediaRecord | undefined;
      resolve(record && !removedLocalFiles.has(idbKey) ? record.blob : null);
    };
    req.onerror = () => reject(req.error);
  }).finally(() => db.close?.());
}

/**
 * Resolve qualquer URL:
 * - Se for `idb:<id>`, busca no IndexedDB e retorna uma Blob URL (`blob:http...`).
 * - Se for URL comum (http, https, data), retorna como está.
 */
export async function resolveMediaUrl(url: string | undefined | null): Promise<string> {
  if (!url) return '';
  const requestActor = getCacheUser();
  const location = storageLocation(url);
  if (location) {
    const actor = getCacheUser();
    if (!actor) return '';
    const key = `${actor}:${location.bucket}/${location.path}`;
    const cached = signedUrlCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 3600);
    if (error || !data?.signedUrl || actor !== getCacheUser()) return '';
    signedUrlCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + 40 * 60 * 1000 });
    return data.signedUrl;
  }
  if (!url.startsWith('idb:') && !url.startsWith('supamedia:')) return url;

  // Check cache first
  const cached = blobUrlCache.get(url);
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
        if (data.notes.startsWith('data:')) {
          const parts = data.notes.split(',');
          const mime = parts[0].match(/:(.*?);/)?.[1] || 'video/mp4';
          const bstr = atob(parts[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const blob = new Blob([u8arr], { type: mime });
          objectUrl = URL.createObjectURL(blob);
        } else if (data.notes.startsWith('http')) {
          objectUrl = await resolveMediaUrl(data.notes.trim());
        }
        if (objectUrl && actor === getCacheUser()) {
          blobUrlCache.set(url, objectUrl);
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
    if (!blob || requestActor !== getCacheUser()) return '';
    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache.set(url, objectUrl);
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
  const [resolved, setResolved] = useState<string>(() => {
    if (!url) return '';
    if (storageLocation(url)) return '';
    if (!url.startsWith('idb:') && !url.startsWith('supamedia:')) return url;
    return blobUrlCache.get(url) || '';
  });

  useEffect(() => {
    if (!url) {
      setResolved('');
      return;
    }
    if (!storageLocation(url) && !url.startsWith('idb:') && !url.startsWith('supamedia:')) {
      setResolved(url);
      return;
    }
    const cached = storageLocation(url) ? undefined : blobUrlCache.get(url);
    if (cached) {
      setResolved(cached);
      return;
    }

    let isMounted = true;
    const refresh = () => resolveMediaUrl(url).then(res => {
      if (isMounted) setResolved(res);
    });
    void refresh();
    const timer = storageLocation(url) ? setInterval(() => void refresh(), 45 * 60 * 1000) : undefined;
    return () => { isMounted = false; if (timer) clearInterval(timer); };
  }, [url]);

  return resolved;
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

/**
 * Baixa e armazena vídeos pesados em cache local (IndexedDB + Blob URL).
 * Evita o estrangulamento de requisições parciais (Range HTTP 206) de hosts externos,
 * fazendo com que o vídeo carregue em ~2 segundos e rode 100% liso direto da memória RAM do celular.
 */
export async function getCachedVideoBlobUrl(url: string): Promise<string> {
  if (!url) return '';
  if (storageLocation(url)) {
    // Signed URLs are authorized per user; never persist private media in the
    // shared URL-based video cache.
    return resolveMediaUrl(url);
  }
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.includes('youtube.com') || url.includes('youtu.be')) return url;

  // 1. Verifica cache em memória
  if (blobUrlCache.has(url)) {
    return blobUrlCache.get(url)!;
  }

  // 2. Verifica no IndexedDB
  // Full URL identity: suffixes collide across origins and different directories.
  // v2 deliberately does not read the old, ambiguous suffix-based entries.
  const cacheKey = `vcache_v2_${encodeURIComponent(url)}`;
  const requestActor = getCacheUser();
  try {
    const cachedBlob = await getLocalBlob(`idb:${cacheKey}`);
    if (requestActor !== getCacheUser()) return '';
    if (cachedBlob && cachedBlob.size > 0) {
      const objUrl = URL.createObjectURL(cachedBlob);
      blobUrlCache.set(url, objUrl);
      return objUrl;
    }
  } catch {
    // prossegue para download
  }

  // 3. Download direto do arquivo completo via fetch
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (requestActor !== getCacheUser()) return '';
    if (blob.size > 100 * 1024 * 1024) return url;
    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache.set(url, objectUrl);

    // Salva no IndexedDB em background
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        id: cacheKey,
        blob,
        name: cacheKey,
        type: blob.type || 'video/mp4',
        size: blob.size,
        createdAt: Date.now()
      });
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
      tx.onerror = () => db.close();
    } catch {}

    return objectUrl;
  } catch (err) {
    console.warn('Falha no download do blob do vídeo, usando URL direta:', err);
    return url;
  }
}

