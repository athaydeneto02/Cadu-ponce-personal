/**
 * mediaDb.ts
 * Armazenamento local de alta capacidade via IndexedDB para vídeos e imagens.
 * Permite anexar vídeos e fotos direto do computador sem estourar a cota de 5MB do localStorage.
 */

import { useState, useEffect } from 'react';
import { supabase } from './supabase';

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
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
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
  const id = idbKey.replace(/^idb:/, '');
  const db = await openDb();

  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => {
      const record = req.result as MediaRecord | undefined;
      resolve(record ? record.blob : null);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Resolve qualquer URL:
 * - Se for `idb:<id>`, busca no IndexedDB e retorna uma Blob URL (`blob:http...`).
 * - Se for URL comum (http, https, data), retorna como está.
 */
export async function resolveMediaUrl(url: string | undefined | null): Promise<string> {
  if (!url) return '';
  if (!url.startsWith('idb:') && !url.startsWith('supamedia:')) return url;

  // Check cache first
  const cached = blobUrlCache.get(url);
  if (cached) return cached;

  // 1. Resolve from Supabase Cloud Media
  if (url.startsWith('supamedia:')) {
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
          objectUrl = data.notes.trim();
        }
        if (objectUrl) {
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
    if (!blob) return '';
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
    if (!url.startsWith('idb:') && !url.startsWith('supamedia:')) return url;
    return blobUrlCache.get(url) || '';
  });

  useEffect(() => {
    if (!url) {
      setResolved('');
      return;
    }
    if (!url.startsWith('idb:') && !url.startsWith('supamedia:')) {
      setResolved(url);
      return;
    }
    const cached = blobUrlCache.get(url);
    if (cached) {
      setResolved(cached);
      return;
    }

    let isMounted = true;
    resolveMediaUrl(url).then(res => {
      if (isMounted) setResolved(res);
    });
    return () => { isMounted = false; };
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
