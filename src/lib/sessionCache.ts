/** Browser caches are scoped to the identity validated by Supabase Auth. */
let activeUserId: string | null = null;
const PREFIX = 'cadu:v2:';

export function setCacheUser(userId: string | null): void {
  // Preserve old offline data before retiring the shared cache format. Orphans
  // stay quarantined for recovery; they are never shown to a new account.
  let legacyOwner: string | null = null;
  try { legacyOwner = JSON.parse(localStorage.getItem('cadu_ponce_user') ?? 'null')?.uid ?? null; }
  catch { /* corrupt legacy profile */ }
  const legacyKeys = Object.keys(localStorage).filter(key =>
    (key.startsWith('cadu_') || key === 'cp_agenda_events') && key !== 'cadu_ponce_theme');
  for (const key of legacyKeys) {
    const target = legacyOwner ? `${PREFIX}${legacyOwner}:${key}` : `cadu:legacy:${key}`;
    let value = localStorage.getItem(key);
    if (key === 'cadu_workout_logs' && value) {
      try {
        value = JSON.stringify(JSON.parse(value).map((log: Record<string, unknown>) => ({ ...log, syncStatus: log.syncStatus || 'pending' })));
      } catch { /* keep the original value for manual recovery */ }
    }
    try {
      if (value !== null && localStorage.getItem(target) === null) localStorage.setItem(target, value);
      localStorage.removeItem(key);
    } catch { /* do not erase old offline data if the migration hits the quota */ }
  }
  activeUserId = userId;
}

export function getCacheUser(): string | null { return activeUserId; }

export function cacheForUser(userId: string | null) {
  return {
    getItem(key: string): string | null {
      return userId ? localStorage.getItem(`${PREFIX}${userId}:${key}`) : null;
    },
    setItem(key: string, value: string): void {
      if (!userId) throw new Error('Entre na sua conta antes de salvar dados.');
      localStorage.setItem(`${PREFIX}${userId}:${key}`, value);
    },
    removeItem(key: string): void {
      if (userId) localStorage.removeItem(`${PREFIX}${userId}:${key}`);
    },
  };
}

export const sessionCache = {
  getItem: (key: string) => cacheForUser(activeUserId).getItem(key),
  setItem: (key: string, value: string) => cacheForUser(activeUserId).setItem(key, value),
  removeItem: (key: string) => cacheForUser(activeUserId).removeItem(key),
};

export function readCached<T>(key: string, fallback: T, userId = activeUserId): T {
  try { return JSON.parse(cacheForUser(userId).getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}
