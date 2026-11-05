export interface LibraryExercise {
  id: string;
  title: string;
  group: string;
  category: string;
  image: string;
  description?: string;
  videoUrl?: string;
  videoFileUrl?: string;
  isCustom: boolean;
  isFavorite?: boolean;
  syncStatus?: 'pending' | 'synced';
}

export const EXERCISE_CACHE_KEY = 'cadu_ponce_exercises_v3';
const DRAFTS_KEY = 'cadu_ponce_exercise_drafts';
const DELETED_KEY = 'cadu_ponce_deleted_custom_exercises';
const FAVORITES_KEY = 'cadu_exercise_favorites';

interface LibraryCache {
  readJson<T>(key: string, fallback: T): T;
  setItem(key: string, value: string): void;
  setRemoteItem(key: string, value: string): boolean;
}

export function readLibraryCache(cache: LibraryCache) {
  const deleted = new Set(cache.readJson<string[]>(DELETED_KEY, []));
  const unique = (items: LibraryExercise[]) => [...new Map((Array.isArray(items) ? items : [])
    .filter(item => item && typeof item.id === 'string' && !deleted.has(item.id))
    .map(item => [item.id, item])).values()];
  const confirmed = unique(cache.readJson<LibraryExercise[]>(EXERCISE_CACHE_KEY, []));
  const drafts = unique(cache.readJson<LibraryExercise[]>(DRAFTS_KEY, []));
  return { confirmed, drafts, all: unique([...confirmed, ...drafts]), deleted,
    favorites: cache.readJson<Record<string, boolean>>(FAVORITES_KEY, {}) };
}

/** Preserve unconfirmed legacy edits before replacing a discardable remote cache. */
export function storeLibrarySnapshot(cache: LibraryCache, confirmed: LibraryExercise[], drafts: LibraryExercise[]): boolean {
  const uniqueDrafts = [...new Map(drafts.map(exercise => [exercise.id, { ...exercise, syncStatus: 'pending' as const }])).values()];
  try {
    if (uniqueDrafts.length || cache.readJson<LibraryExercise[]>(DRAFTS_KEY, []).length) {
      cache.setItem(DRAFTS_KEY, JSON.stringify(uniqueDrafts));
    }
  } catch {
    // The old cache may be the only copy of an offline video or edit. Keep it intact.
    return false;
  }
  cache.setRemoteItem(EXERCISE_CACHE_KEY, JSON.stringify(confirmed));
  return true;
}

export function markLibraryExerciseDeleted(cache: LibraryCache, id: string): void {
  const deleted = new Set(cache.readJson<string[]>(DELETED_KEY, []));
  deleted.add(id);
  cache.setItem(DELETED_KEY, JSON.stringify([...deleted]));
}

export function hasExerciseChanges(local: LibraryExercise, remote: LibraryExercise): boolean {
  const fields = ['title', 'group', 'category', 'image', 'description', 'videoUrl', 'videoFileUrl'] as const;
  return fields.some(field => (local[field] ?? '') !== (remote[field] ?? ''))
    || (local.isCustom ?? true) !== remote.isCustom;
}

/** Existing prescriptions are snapshots: editing a library entry never matches them by name. */
export function exerciseVideoFields(value: string, original?: LibraryExercise) {
  if (original && value === (original.videoFileUrl || original.videoUrl || '')) {
    return { videoUrl: original.videoUrl || '', videoFileUrl: original.videoFileUrl || '' };
  }
  const file = value.startsWith('storage://') || value.startsWith('supamedia:') || /\.(mp4|mov|webm)(?:[?#]|$)/i.test(value);
  return { videoUrl: file ? '' : value, videoFileUrl: file ? value : '' };
}
