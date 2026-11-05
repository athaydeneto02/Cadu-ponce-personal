/** Browser caches are scoped to the identity validated by Supabase Auth. */
let activeUserId: string | null = null;
const PREFIX = 'cadu:v2:';
// Optional remote snapshots may fall back to memory. Outboxes never use this
// path: setItem succeeds only after the browser has persisted the value.
const remoteMemory = new Map<string, { value: string; diskValue: string | null }>();
const disposableSnapshots = new Map<string, string>();
const durableKeys = new Set(['cadu_workout_logs', 'cadu_ponce_photos', 'cadu_deleted_photos', 'cadu_media_cleanup', 'cadu_ponce_exercise_drafts', 'cadu_ponce_deleted_routines', 'cadu_ponce_deleted_custom_exercises']);

function diskRead(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function hasLocalChanges(value: unknown): boolean {
  if (typeof value === 'string') return /^(idb:|blob:)/.test(value);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.syncStatus === 'pending' || record.notificationStatus === 'pending' || !!record.localFileKey || Object.values(record).some(hasLocalChanges);
}

function hasInlineMedia(value: unknown): boolean {
  if (typeof value === 'string') return /^data:/i.test(value);
  return !!value && typeof value === 'object' && Object.values(value).some(hasInlineMedia);
}

/** Large inline media stays intact in memory instead of producing a partial editable cache. */
function remoteValuePolicy(value: string): { disposable: boolean; memoryOnly: boolean } {
  try {
    const parsed = JSON.parse(value);
    const localChanges = hasLocalChanges(parsed);
    return { disposable: !localChanges, memoryOnly: hasInlineMedia(parsed) };
  } catch { return { disposable: false, memoryOnly: false }; }
}

function reclaimRemoteSnapshots(except: string): void {
  // Never sweep localStorage by prefix: old versions also stored unsent data
  // there. Only snapshots confirmed by this session may be discarded.
  for (const [key, value] of disposableSnapshots) {
    if (key === except || diskRead(key) !== value) continue;
    try {
      const latest = remoteMemory.get(key);
      localStorage.removeItem(key);
      remoteMemory.set(key, { value: latest?.diskValue === value ? latest.value : value, diskValue: null });
      disposableSnapshots.delete(key);
    } catch { /* Optional caches cannot prevent a durable write attempt. */ }
  }
}

export function setCacheUser(userId: string | null): void {
  if (activeUserId && activeUserId !== userId) {
    const departingPrefix = `${PREFIX}${activeUserId}:`;
    for (const [key, confirmed] of disposableSnapshots) {
      if (!key.startsWith(departingPrefix)) continue;
      // A draft or another tab may have replaced this confirmed snapshot.
      // Never remove a value that no longer matches what this session saved.
      if (diskRead(key) === confirmed) { try { localStorage.removeItem(key); } catch { /* Browser storage may be unavailable. */ } }
      disposableSnapshots.delete(key);
    }
    for (const key of remoteMemory.keys()) if (key.startsWith(departingPrefix)) remoteMemory.delete(key);
  }
  // Preserve old offline data before retiring the shared cache format. Orphans
  // stay quarantined for recovery; they are never shown to a new account.
  let legacyOwner: string | null = null;
  try { legacyOwner = JSON.parse(localStorage.getItem('cadu_ponce_user') ?? 'null')?.uid ?? null; }
  catch { /* corrupt legacy profile */ }
  let legacyKeys: string[] = [];
  try { legacyKeys = Object.keys(localStorage).filter(key =>
    (key.startsWith('cadu_') || key === 'cp_agenda_events') && key !== 'cadu_ponce_theme'); }
  catch { /* Restricted storage must not prevent an authenticated session. */ }
  let incompleteMigration = false;
  // The profile identifies the owner of every remaining legacy record. Retire
  // it only after all other records have reached their isolated destination.
  legacyKeys.sort((a, b) => Number(a === 'cadu_ponce_user') - Number(b === 'cadu_ponce_user'));
  for (const key of legacyKeys) {
    if (key === 'cadu_ponce_user' && incompleteMigration) continue;
    const target = legacyOwner ? `${PREFIX}${legacyOwner}:${key}` : `cadu:legacy:${key}`;
    let value = diskRead(key);
    if (key === 'cadu_workout_logs' && value) {
      try {
        value = JSON.stringify(JSON.parse(value).map((log: Record<string, unknown>) => ({ ...log, syncStatus: log.syncStatus || 'pending' })));
      } catch { /* keep the original value for manual recovery */ }
    }
    try {
      const existing = localStorage.getItem(target);
      // A previous migration may already have a different outbox. Keep both
      // copies for recovery instead of erasing the unmerged legacy version.
      if (value !== null && existing !== null && existing !== value) { incompleteMigration = true; continue; }
      if (value !== null && existing === null) localStorage.setItem(target, value);
      localStorage.removeItem(key);
    } catch { incompleteMigration = true; /* Keep the original and its owner if the migration hits quota. */ }
  }
  activeUserId = userId;
}

export function getCacheUser(): string | null { return activeUserId; }

export function cacheForUser(userId: string | null) {
  return {
    getItem(key: string): string | null {
      if (!userId) return null;
      const fullKey = `${PREFIX}${userId}:${key}`;
      const diskValue = diskRead(fullKey);
      const memory = remoteMemory.get(fullKey);
      if (memory && memory.diskValue === diskValue) return memory.value;
      remoteMemory.delete(fullKey);
      return diskValue;
    },
    readJson<T>(key: string, fallback: T): T {
      try {
        const value = JSON.parse(this.getItem(key) ?? 'null');
        return (Array.isArray(fallback) && !Array.isArray(value)) ? fallback : value ?? fallback;
      }
      catch { return fallback; }
    },
    setItem(key: string, value: string): void {
      if (!userId) throw new Error('Entre na sua conta antes de salvar dados.');
      const fullKey = `${PREFIX}${userId}:${key}`;
      try { localStorage.setItem(fullKey, value); }
      catch {
        reclaimRemoteSnapshots(fullKey);
        // A second failure must reach the caller. Never pretend an outbox was
        // saved because it is present only in memory.
        localStorage.setItem(fullKey, value);
      }
      remoteMemory.delete(fullKey);
      disposableSnapshots.delete(fullKey);
    },
    setRemoteItem(key: string, value: string, options: { preserveLocal?: boolean } = {}): boolean {
      if (!userId) return false;
      const fullKey = `${PREFIX}${userId}:${key}`;
      // Some mutations merge one confirmed row with older, unverified local
      // records. Those records cannot yet be made discardable.
      const policy = remoteValuePolicy(value);
      const disposable = policy.disposable && !options.preserveLocal && !durableKeys.has(key) && !key.startsWith('cadu_workout_session_');
      // A late read cannot restore discarded data after that identity left.
      // Durable/outbox merges retain their existing per-owner guarantees.
      if (disposable && userId !== activeUserId) return false;
      if (policy.memoryOnly) {
        remoteMemory.set(fullKey, { value, diskValue: diskRead(fullKey) });
        return false;
      }
      try {
        try { localStorage.setItem(fullKey, value); }
        catch { reclaimRemoteSnapshots(fullKey); localStorage.setItem(fullKey, value); }
        remoteMemory.delete(fullKey);
        if (disposable) disposableSnapshots.set(fullKey, value);
        else disposableSnapshots.delete(fullKey);
        return true;
      } catch {
        remoteMemory.set(fullKey, { value, diskValue: diskRead(fullKey) });
        return false;
      }
    },
    removeItem(key: string): void {
      if (userId) {
        const fullKey = `${PREFIX}${userId}:${key}`;
        localStorage.removeItem(fullKey);
        remoteMemory.delete(fullKey);
        disposableSnapshots.delete(fullKey);
      }
    },
  };
}

export const sessionCache = {
  getItem: (key: string) => cacheForUser(activeUserId).getItem(key),
  setItem: (key: string, value: string) => cacheForUser(activeUserId).setItem(key, value),
  setRemoteItem: (key: string, value: string, options?: { preserveLocal?: boolean }) => cacheForUser(activeUserId).setRemoteItem(key, value, options),
  readJson: <T>(key: string, fallback: T): T => cacheForUser(activeUserId).readJson(key, fallback),
  removeItem: (key: string) => cacheForUser(activeUserId).removeItem(key),
};

export function readCached<T>(key: string, fallback: T, userId = activeUserId): T {
  return cacheForUser(userId).readJson(key, fallback);
}
