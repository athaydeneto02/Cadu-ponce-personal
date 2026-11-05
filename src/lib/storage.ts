/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * storage.ts — Supabase-backed data layer.
 * All admin data (routines, custom exercises, categories, muscle groups)
 * is stored directly in Supabase tables — not in localStorage metadata hacks.
 * localStorage is used only as a fast read-cache for the current session.
 */

import { supabase } from './supabase';
import { Workout, ProgressEntry, EvolutionPhoto, UserProfile, AdminRoutine, AdminExercise, WorkoutLog, FinancialInvoice, TrainerPaymentSettings } from '../types';
import { storeLocalFile, compressImage, resolveMediaUrl, getLocalBlob, toStorageReference, clearMediaCache, normalizeStoredMediaReference } from './mediaDb';
import { LibraryExercise, readLibraryCache, storeLibrarySnapshot, markLibraryExerciseDeleted, hasExerciseChanges } from './exerciseLibrary';
import { sessionCache as cacheStorage, cacheForUser, getCacheUser, setCacheUser, readCached } from './sessionCache';
import type { TrainerNotification } from './trainerNotifications';

// Best effort only for snapshots already confirmed by the server. Local-only
// drafts and outboxes must use the durable cache.setItem API instead.
export function safeSetItem(key: string, value: string, cache = cacheStorage): boolean {
  return cache.setRemoteItem(key, value);
}

function persistOutbox<T extends { syncStatus?: string; notificationStatus?: string; localFileKey?: string; photoURL?: string }>(
  cache: ReturnType<typeof cacheForUser>, key: string, entries: T[],
): void {
  try { cache.setItem(key, JSON.stringify(entries)); }
  catch {
    // Confirmed history can be fetched again. Pending/legacy records and their
    // IndexedDB references must all survive; failure of this write is fatal.
    const pending = entries.filter(entry => entry.syncStatus !== 'synced' || entry.notificationStatus === 'pending' || entry.localFileKey || /^(idb:|blob:)/.test(entry.photoURL ?? ''));
    cache.setItem(key, JSON.stringify(pending));
  }
}

type LogRange = { from?: string; to?: string; allowCached?: boolean };
function inLogRange(log: WorkoutLog, range: LogRange): boolean {
  const date = Date.parse(log.completedAt);
  return Number.isFinite(date) && (!range.from || date >= Date.parse(range.from)) && (!range.to || date < Date.parse(range.to));
}

async function queryWorkoutLogs(studentId?: string, range: LogRange = {}): Promise<WorkoutLog[]> {
  const pageSize = 500;
  const logs: WorkoutLog[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from('workout_logs').select('*').order('completed_at', { ascending: false }).order('id', { ascending: false });
    if (studentId) query = query.eq('student_id', studentId);
    if (range.from) query = query.gte('completed_at', range.from);
    if (range.to) query = query.lt('completed_at', range.to);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data) throw new Error('Não foi possível carregar o histórico de treinos.');
    logs.push(...data.map(row => ({
      id: row.id, studentId: row.student_id, studentName: row.student_name ?? undefined,
      routineId: row.routine_id, routineName: row.routine_name, completedAt: row.completed_at,
      durationSeconds: row.duration_seconds, rpe: row.rpe, exercisesSummary: row.exercises_summary ?? [],
      comment: row.comment ?? undefined, syncStatus: 'synced' as const,
    })));
    if (data.length < pageSize) return logs;
  }
}

function emitWorkoutChange(log: WorkoutLog, actor: string): void {
  if (typeof window !== 'undefined' && actor === getCacheUser()) {
    window.dispatchEvent(new CustomEvent('cadu_workout_completed', { detail: { studentId: log.studentId, logId: log.id, syncStatus: log.syncStatus } }));
  }
}

const completionPushRequests = new Map<string, Promise<boolean>>();
/** The database already created the in-app notice; this requests optional device delivery. */
function requestCompletionPush(logId: string, actor: string): Promise<boolean> {
  const requestKey = `${actor}:${logId}`;
  const running = completionPushRequests.get(requestKey);
  if (running) return running;
  const request = (async () => {
    try {
      if (actor !== getCacheUser() || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.id !== actor || actor !== getCacheUser()) return false;
      const response = await fetch('/api/workout-completed', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ logId }), signal: AbortSignal.timeout(25_000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.pending !== false || !['sentCount', 'failedCount', 'skippedCount'].every(key => Number.isFinite(result[key]))) return false;
      const cache = cacheForUser(actor);
      const logs = cache.readJson<WorkoutLog[]>('cadu_workout_logs', []);
      cache.setRemoteItem('cadu_workout_logs', JSON.stringify(logs.map(log => log.id === logId ? { ...log, notificationStatus: 'sent' } : log)), { preserveLocal: true });
      return true;
    } catch { return false; }
  })().finally(() => completionPushRequests.delete(requestKey));
  completionPushRequests.set(requestKey, request);
  return request;
}

async function changeNamedValue(table: 'muscle_groups' | 'exercise_categories', name: string, remove: boolean): Promise<string[]> {
  const actor = getCacheUser();
  if (!actor) throw new Error('Entre na sua conta antes de salvar.');
  const value = name.trim();
  if (!value) throw new Error('Informe o nome.');
  const cache = cacheForUser(actor);
  // Never derive removals from a previously loaded list: another trainer may
  // have added a name since that screen was opened.
  const { error } = remove
    ? await supabase.from(table).delete().eq('name', value)
    : await supabase.from(table).upsert({ name: value }, { onConflict: 'name' });
  if (error) throw error;
  if (actor !== getCacheUser()) throw new Error('A alteração foi salva. Entre novamente para atualizar a lista.');
  const { data, error: readError } = await supabase.from(table).select('name').order('id', { ascending: true });
  if (readError || !data) throw new Error('A alteração foi salva, mas não foi possível recarregar a lista. Atualize a página.');
  const names = data.map(row => row.name as string);
  cache.setRemoteItem(table === 'muscle_groups' ? 'cadu_ponce_muscle_groups' : 'cadu_ponce_categories', JSON.stringify(names));
  return names;
}

// ---------------------------------------------------------------------------
// Local-storage cache keys (session cache only — NOT the source of truth)
// ---------------------------------------------------------------------------
const CACHE_KEYS = {
  USER: 'cadu_ponce_user',
  WORKOUTS: 'cadu_ponce_workouts',
  PROGRESS: 'cadu_ponce_progress',
  PHOTOS: 'cadu_ponce_photos',
};

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    uid: row.id as string,
    name: row.name as string,
    email: row.email as string,
    photoURL: (row.photo_url as string) ?? undefined,
    weight: (row.weight as number) ?? undefined,
    height: (row.height as number) ?? undefined,
    trainerPhone: (row.trainer_phone as string) ?? undefined,
    role: row.role === 'admin' ? 'admin' : 'student',
    status: (row.status as UserProfile['status']) ?? 'inactive',
    modality: (row.modality as UserProfile['modality']) ?? undefined,
    metadata: (row.metadata as UserProfile['metadata']) ?? {},
    createdAt: row.created_at as string,
  };
}

function rowToWorkout(row: Record<string, unknown>): Workout {
  const exercises = ((row.exercises as Record<string, unknown>[]) ?? [])
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((e) => ({
      id: e.id as string,
      name: e.name as string,
      sets: e.sets as number,
      reps: e.reps as string,
      rest: (e.rest as string) ?? '60s',
      notes: (e.notes as string) ?? undefined,
      currentLoad: (e.current_load as number) ?? 0,
      prescribedLoads: (e.prescribed_loads as number[]) ?? undefined,
    }));

  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    studentId: row.student_id as string,
    routineId: (row.routine_id as string) ?? undefined,
    createdAt: row.created_at as string,
    exercises,
  };
}

function rowToAdminExercise(row: Record<string, unknown>): AdminExercise {
  return {
    id: row.id as string,
    name: row.name as string,
    sets: (row.sets as number) ?? 3,
    reps: (row.reps as string) ?? '10',
    rest: (row.rest as string) ?? '60s',
    notes: (row.notes as string) ?? undefined,
    videoUrl: (row.video_url as string) ?? undefined,
    videoFileUrl: (row.video_file_url as string) ?? undefined,
    combinedWithNext: (row.combined_with_next as boolean) ?? (row.combinedWithNext as boolean) ?? undefined,
    combinedGroup: (row.combined_group as string) ?? (row.combinedGroup as string) ?? undefined,
    prescribedLoads: (row.prescribed_loads as number[]) ?? undefined,
  };
}

function rowToAdminRoutine(row: Record<string, unknown>, exercises: AdminExercise[] = []): AdminRoutine {
  return {
    id: row.id as string,
    name: row.name as string,
    goal: (row.goal as string) ?? '',
    difficulty: (row.difficulty as string) ?? '',
    dayOfWeek: (row.day_of_week as string) ?? undefined,
    muscleGroup: (row.muscle_group as string) ?? undefined,
    generalNotes: (row.general_notes as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    studentIds: (row.student_ids as string[]) ?? [],
    studentNames: (row.student_names as string[]) ?? [],
    startDate: (row.start_date as string) ?? undefined,
    endDate: (row.end_date as string) ?? undefined,
    routineGroupName: (row.routine_group_name as string) ?? undefined,
    exercises,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Storage API
// ---------------------------------------------------------------------------

export const storage = {
  // ── User / Auth ─────────────────────────────────────────────────────────

  setSessionUser: (userId: string | null): void => {
    if (getCacheUser() !== userId) clearMediaCache();
    setCacheUser(userId);
  },
  getCacheItem: (key: string): string | null => cacheStorage.getItem(key),
  setCacheItem: (key: string, value: string): void => cacheStorage.setItem(key, value),

  getUser: (): UserProfile | null => readCached<UserProfile | null>(CACHE_KEYS.USER, null),

  saveUser: (user: UserProfile): void => {
    if (user.uid !== getCacheUser()) return;
    const { password: _password, ...safeUser } = user;
    cacheStorage.setRemoteItem(CACHE_KEYS.USER, JSON.stringify(safeUser));
  },

  /** Roles come only from the protected database profile. */
  fetchProfile: async (userId: string): Promise<UserProfile | null> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data ? rowToUserProfile(data) : null;
  },

  fetchCurrentProfile: async (sessionUser?: { id: string }): Promise<UserProfile | null> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user || (sessionUser && data.user.id !== sessionUser.id)) return null;
    const profile = await storage.fetchProfile(data.user.id);
    if (profile) storage.saveUser(profile);
    return profile;
  },

  /** Fetches all profiles from Supabase (admin use). */
  fetchUsersList: async (options: { allowCached?: boolean } = {}): Promise<UserProfile[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) {
      if (options.allowCached === false) {
        throw error ?? new Error('Não foi possível carregar a lista atual de usuários.');
      }
      return cacheStorage.readJson<UserProfile[]>('cadu_ponce_all_users', []);
    }
    const users = data.map(rowToUserProfile);
    cacheStorage.setRemoteItem('cadu_ponce_all_users', JSON.stringify(users));
    return users;
  },

  /** Returns cached users list (sync). */
  getUsersList: (): UserProfile[] => {
    return cacheStorage.readJson<UserProfile[]>('cadu_ponce_all_users', []);
  },

  /** Saves users list to local cache. */
  saveUsersList: (users: UserProfile[]): void => {
    cacheStorage.setRemoteItem('cadu_ponce_all_users', JSON.stringify(users));
  },

  /** Updates a user profile in Supabase. */
  updateProfile: async (user: UserProfile): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('profiles')
      .update({
        name: user.name,
        photo_url: user.photoURL ?? null,
        weight: user.weight ?? null,
        height: user.height ?? null,
        trainer_phone: user.trainerPhone ?? null,
        role: user.role,
        status: user.status ?? 'active',
        modality: user.modality ?? null,
        metadata: user.metadata ?? {},
      })
      .eq('id', user.uid)
      .select('id')
      .single();

    if (error) throw error;
    if (data?.id !== user.uid) throw new Error('O perfil não foi atualizado. Entre novamente e tente salvar.');
    if (user.uid === getCacheUser()) storage.saveUser(user);
  },

  /** Deletes a profile from Supabase. */
  deleteProfile: async (userId: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) throw error;
    const users = cacheStorage.readJson<UserProfile[]>('cadu_ponce_all_users', []).filter(u => u.uid !== userId);
    cacheStorage.setRemoteItem('cadu_ponce_all_users', JSON.stringify(users));
  },

  /** Public registration never assigns privileged roles or assumes a session. */
  createStudentAccount: async (
    email: string, password: string, name: string, extraData?: Partial<UserProfile>
  ): Promise<UserProfile> => {
    const cacheStorage = cacheForUser(getCacheUser());
    if (extraData?.role === 'admin') throw new Error('Administradores só podem ser criados pelo painel autorizado.');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password, options: { data: { name: name.trim() } },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Não foi possível criar a conta.');
    if (!data.session) throw new Error('Conta criada. Confirme o e-mail recebido antes de entrar.');
    if (extraData) {
      const { error: updateError } = await supabase.from('profiles').update({
        weight: extraData.weight ?? null,
        height: extraData.height ?? null,
      }).eq('id', data.user.id);
      if (updateError) throw new Error('Conta criada, mas os dados adicionais não foram salvos. Entre para completá-los.');
    }
    const profile = await storage.fetchProfile(data.user.id);
    if (!profile) throw new Error('Conta criada, mas o perfil ainda não está disponível. Tente entrar novamente.');
    return profile;
  },

  adminCreateUser: async (email: string, name: string, extraData?: Partial<UserProfile>): Promise<UserProfile> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Entre novamente para cadastrar um aluno.');
    const response = await fetch('/api/admin-create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...extraData, email: email.trim(), name: name.trim() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.user) throw new Error(result.error || 'Não foi possível criar a conta.');
    return rowToUserProfile(result.user);
  },

  // ── Workouts ─────────────────────────────────────────────────────────────

  getWorkouts: (): Workout[] => readCached<Workout[]>(CACHE_KEYS.WORKOUTS, []),

  fetchWorkouts: async (studentId?: string): Promise<Workout[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const cache = cacheForUser(getCacheUser());
    let query = supabase.from('workouts').select('*').order('created_at', { ascending: false });
    if (studentId) query = query.eq('student_id', studentId);
    const { data, error } = await query;
    const cached = cache.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []);
    if (error || !data) return cached.filter(w => !studentId || w.studentId === studentId);
    const ids = data.map(row => row.id);
    const exercises = ids.length
      ? await supabase.from('exercises').select('*').in('workout_id', ids).order('sort_order', { ascending: true })
      : { data: [], error: null };
    if (exercises.error) throw exercises.error;
    const workouts = data.map(row => rowToWorkout({ ...row, exercises: (exercises.data ?? []).filter(exercise => exercise.workout_id === row.id) }));
    const others = studentId ? cached.filter(w => w.studentId !== studentId) : [];
    cache.setRemoteItem(CACHE_KEYS.WORKOUTS, JSON.stringify([...others, ...workouts]));
    return workouts;
  },

  saveWorkout: async (workout: Workout): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const cache = cacheForUser(getCacheUser());
    const { error: workoutError } = await supabase.from('workouts').upsert({
      id: workout.id, name: workout.name, description: workout.description ?? null,
      student_id: workout.studentId, routine_id: workout.routineId ?? null,
    });
    if (workoutError) throw workoutError;
    const { data: existing, error: readError } = await supabase.from('exercises').select('id').eq('workout_id', workout.id);
    if (readError) throw readError;
    const existingIds = new Set((existing ?? []).map(e => e.id));
    const rows = workout.exercises.map((exercise, index) => {
      const id = existingIds.has(exercise.id) ? exercise.id : crypto.randomUUID();
      exercise.id = id;
      return { id, workout_id: workout.id, name: exercise.name, sets: exercise.sets,
        reps: exercise.reps, rest: exercise.rest ?? '60s', notes: exercise.notes ?? null,
        current_load: exercise.currentLoad ?? 0, prescribed_loads: exercise.prescribedLoads ?? null, sort_order: index };
    });
    if (rows.length) {
      const { error } = await supabase.from('exercises').upsert(rows);
      if (error) throw error;
    }
    const kept = new Set(rows.map(row => row.id));
    const removed = [...existingIds].filter(id => !kept.has(id));
    if (removed.length) {
      const { error } = await supabase.from('exercises').delete().eq('workout_id', workout.id).in('id', removed);
      if (error) throw error;
    }
    const all = cache.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []);
    cache.setRemoteItem(CACHE_KEYS.WORKOUTS, JSON.stringify([workout, ...all.filter(w => w.id !== workout.id)]), { preserveLocal: true });
  },

  saveWorkouts: async (workouts: Workout[]): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    for (const workout of workouts) await storage.saveWorkout(workout);
  },

  /** Delete the selected assignment only. Display names never identify records. */
  deleteWorkout: async (workoutId: string, studentId?: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const cache = cacheForUser(getCacheUser());
    const { data, error } = await supabase.rpc('delete_workout_assignment', {
      p_workout_id: workoutId, p_student_id: studentId ?? null,
    });
    if (error) throw error;
    if (!data) throw new Error('Treino não encontrado para esse aluno. Atualize a lista.');
    const all = cache.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []);
    cache.setRemoteItem(CACHE_KEYS.WORKOUTS, JSON.stringify(all.filter(w => w.id !== workoutId || (studentId && w.studentId !== studentId))), { preserveLocal: true });
  },

  // ── Progress ──────────────────────────────────────────────────────────────

  getProgress: (): ProgressEntry[] => {
    return cacheStorage.readJson<ProgressEntry[]>(CACHE_KEYS.PROGRESS, []);
  },

  fetchProgress: async (studentId: string): Promise<ProgressEntry[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('progress_entries')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: false });

    if (error || !data) return cacheStorage.readJson<ProgressEntry[]>(CACHE_KEYS.PROGRESS, []).filter(entry => entry.studentId === studentId);

    const entries: ProgressEntry[] = data.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      exerciseName: row.exercise_name,
      load: row.load,
      reps: row.reps,
      notes: row.notes ?? undefined,
      date: row.date,
    }));

    cacheStorage.setRemoteItem(CACHE_KEYS.PROGRESS, JSON.stringify(entries));
    return entries;
  },

  saveProgress: async (entry: ProgressEntry): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('progress_entries').upsert({
      id: entry.id,
      student_id: entry.studentId,
      exercise_name: entry.exerciseName,
      load: entry.load,
      reps: entry.reps,
      notes: entry.notes ?? null,
      date: entry.date,
    });
    if (error) throw error;
    const all = cacheStorage.readJson<ProgressEntry[]>(CACHE_KEYS.PROGRESS, []);
    cacheStorage.setRemoteItem(CACHE_KEYS.PROGRESS, JSON.stringify([entry, ...all]));
  },

  // ── Evolution Photos ──────────────────────────────────────────────────────

  getPhotos: (): EvolutionPhoto[] => readCached<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, []),

  fetchPhotos: async (studentId: string): Promise<EvolutionPhoto[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const actor = getCacheUser();
    const cache = cacheForUser(actor);
    const cached = readCached<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, [], actor);
    const { data, error } = await supabase.from('evolution_photos').select('*').eq('student_id', studentId).order('date', { ascending: false });
    if (error || !data) return cached.filter(photo => photo.studentId === studentId);
    const remote: EvolutionPhoto[] = data.map(row => ({ id: row.id, studentId: row.student_id,
      photoURL: row.photo_url, notes: row.notes ?? undefined, date: row.date, syncStatus: 'synced' }));
    // Read old photos without treating the agenda as a second write destination.
    const { data: legacy } = await supabase.from('agenda_events').select('*').eq('type', 'evolution_photo').eq('student_id', studentId);
    for (const row of legacy ?? []) {
      try {
        const item = JSON.parse(row.notes ?? '{}');
        if (!remote.some(p => p.id === row.id) && typeof item.photoURL === 'string' && !/^(blob:|idb:)/.test(item.photoURL)) {
          remote.push({ id: row.id, studentId, photoURL: item.photoURL, date: item.date || row.created_at, notes: item.notes, syncStatus: 'synced' });
        }
      } catch { /* malformed legacy record */ }
    }
    const latest = readCached<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, [], actor);
    const pending = latest.filter(photo => photo.studentId === studentId && (photo.syncStatus === 'pending' || photo.photoURL.startsWith('idb:')));
    const pendingIds = new Set(pending.map(photo => photo.id));
    const merged = [...pending, ...remote.filter(photo => !pendingIds.has(photo.id))];
    cache.setRemoteItem(CACHE_KEYS.PHOTOS, JSON.stringify([...latest.filter(photo => photo.studentId !== studentId), ...merged]));
    return merged;
  },

  /** Preserve the file durably before uploading. Temporary blob URLs never reach the database. */
  savePhoto: async (photo: EvolutionPhoto, file?: File): Promise<string> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const actor = getCacheUser();
    if (!actor) throw new Error('Entre na sua conta para salvar a foto.');
    const cache = cacheForUser(actor);
    let localKey = photo.localFileKey || (photo.photoURL.startsWith('idb:') ? photo.photoURL : undefined);
    let uploadBlob: Blob | null = file ?? null;
    if (file) {
      if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
      if (file.size > 20 * 1024 * 1024) throw new Error('A foto deve ter no máximo 20 MB.');
      uploadBlob = await compressImage(file, 1600, 0.85);
      localKey = await storeLocalFile(uploadBlob, `photo_${photo.id}`);
    } else if (localKey) {
      uploadBlob = await getLocalBlob(localKey);
      if (!uploadBlob) throw new Error('O arquivo local não foi encontrado. Selecione a foto novamente.');
    }
    let reference = uploadBlob ? (localKey || '') : photo.photoURL;
    if (!reference || reference.startsWith('blob:')) throw new Error('Selecione a foto novamente para salvá-la.');
    let current: EvolutionPhoto = { ...photo, photoURL: reference, localFileKey: localKey, syncStatus: 'pending', syncError: undefined };
    const saveCache = () => {
      const all = readCached<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, [], actor);
      if (current.syncStatus === 'pending') persistOutbox(cache, CACHE_KEYS.PHOTOS, [current, ...all.filter(p => p.id !== photo.id)]);
      else cache.setRemoteItem(CACHE_KEYS.PHOTOS, JSON.stringify([current, ...all.filter(p => p.id !== photo.id)]));
    };
    saveCache();
    try {
      if (actor !== getCacheUser()) throw new Error('A sessão mudou. A foto permanece salva neste dispositivo.');
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Sem conexão. A foto será enviada quando a conexão voltar.');
      if (uploadBlob) {
        const extension = uploadBlob.type === 'image/png' ? 'png' : uploadBlob.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${photo.studentId}/${photo.id}.${extension}`;
        const { error } = await supabase.storage.from('evolution-photos').upload(path, uploadBlob, { upsert: true, contentType: uploadBlob.type });
        if (error) throw error;
        reference = toStorageReference('evolution-photos', path);
      }
      if (actor !== getCacheUser()) throw new Error('A sessão mudou. A sincronização continuará ao entrar novamente.');
      if (/^(idb:|blob:|data:)/.test(reference)) throw new Error('A foto ainda não foi enviada ao armazenamento.');
      const { error } = await supabase.from('evolution_photos').upsert({
        id: photo.id, student_id: photo.studentId, photo_url: reference, notes: photo.notes ?? null, date: photo.date,
      });
      if (error) throw error;
      current = { ...current, photoURL: reference, syncStatus: 'synced', syncError: undefined, localFileKey: undefined };
    } catch (error) {
      current = { ...current, syncStatus: 'pending', syncError: error instanceof Error ? error.message : 'Envio pendente. Tentaremos novamente ao conectar.' };
    }
    saveCache();
    return current.photoURL;
  },

  deletePhoto: async (photoId: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error: legacyError } = await supabase.from('agenda_events').delete().eq('type', 'evolution_photo').eq('id', photoId);
    if (legacyError) throw legacyError;
    const { error } = await supabase.from('evolution_photos').delete().eq('id', photoId);
    if (error) throw error;
    const all = cacheStorage.readJson<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, []);
    persistOutbox(cacheStorage, CACHE_KEYS.PHOTOS, all.filter(p => p.id !== photoId));
  },

  updatePhotoNotes: async (photoId: string, notes: string): Promise<void> => {
    const photo = storage.getPhotos().find(item => item.id === photoId);
    if (!photo) throw new Error('Atualize a galeria antes de editar esta foto.');
    await storage.savePhoto({ ...photo, notes });
  },

  // ── Admin Routines (Fichas por Treino) ────────────────────────────────────
  // Stored in dedicated `admin_routines` + `admin_exercises` Supabase tables.

  ADMIN_ROUTINES_KEY: 'cadu_ponce_admin_routines',

  /** Fetches all admin routines with their exercises from Supabase.
   *  Runs admin_routines, admin_exercises, and agenda_events in PARALLEL for speed. */
  fetchAdminRoutines: async (): Promise<AdminRoutine[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    // Fire all 3 Supabase queries at the same time instead of waiting for each
    const [routinesResult, agendaResult] = await Promise.all([
      supabase.from('admin_routines').select('*').order('created_at', { ascending: false }),
      supabase.from('agenda_events').select('*').in('type', ['assigned_routine', 'deleted_routine']).order('created_at', { ascending: true }),
    ]);

    const { data: routineRows, error: rErr } = routinesResult;
    let safeRoutineRows = routineRows;
    let completeSnapshot = !rErr && !!routineRows && !agendaResult.error;

    if (rErr || !safeRoutineRows) {
      console.warn('fetchAdminRoutines fallback for admin_routines table:', rErr?.message);
      safeRoutineRows = []; // Proceed with empty array so agenda_events can still be parsed!
    }

    // Fetch exercises for all routines in parallel with the agenda query (already done above)
    const routineIds = safeRoutineRows.map(r => r.id as string);
    const exercisesByRoutine: Record<string, AdminExercise[]> = {};

    if (routineIds.length > 0) {
      const { data: exRows, error: exercisesError } = await supabase
        .from('admin_exercises')
        .select('*')
        .in('routine_id', routineIds)
        .order('sort_order', { ascending: true });

      if (exercisesError) {
        completeSnapshot = false;
        const previous = cacheStorage.readJson<AdminRoutine[]>('cadu_ponce_admin_routines', []);
        if (!previous.length) throw exercisesError;
        for (const routine of previous) exercisesByRoutine[routine.id] = routine.exercises;
      }

      if (exRows) {
        exRows.forEach(row => {
          const rid = row.routine_id as string;
          if (!exercisesByRoutine[rid]) exercisesByRoutine[rid] = [];
          exercisesByRoutine[rid].push(rowToAdminExercise(row));
        });
      }
    }

    // Merge Supabase data with local cache:
    const localCached = cacheStorage.readJson<AdminRoutine[]>('cadu_ponce_admin_routines', []);
    const deletedList = cacheStorage.readJson<string[]>('cadu_ponce_deleted_routines', []);
    const deletedSet = new Set(deletedList.map(s => s.toLowerCase().trim()));

    // ONLY check unique ID — NEVER block by routine name!
    const isDeleted = (id?: string) => {
      if (id && deletedSet.has(id.toLowerCase().trim())) return true;
      return false;
    };

    const validLocals = localCached.filter(l => !isDeleted(l.id));
    const validSupabaseRows = safeRoutineRows.filter(r => !isDeleted(r.id as string));
    const supabaseIds = new Set(validSupabaseRows.map(r => r.id as string));
    const unsyncedLocals = rErr ? validLocals.filter(l => !supabaseIds.has(l.id)) : [];

    const routines = validSupabaseRows.map(row => {
      const fromSupabase = rowToAdminRoutine(row, exercisesByRoutine[row.id as string] ?? []);
      // Enrich with any locally-cached new fields that Supabase may not have yet
      const localVersion = validLocals.find(l => l.id === fromSupabase.id);
      if (localVersion) {
        return {
          ...fromSupabase,
          dayOfWeek: fromSupabase.dayOfWeek ?? localVersion.dayOfWeek,
          muscleGroup: fromSupabase.muscleGroup ?? localVersion.muscleGroup,
          generalNotes: fromSupabase.generalNotes ?? localVersion.generalNotes,
          startDate: fromSupabase.startDate ?? localVersion.startDate,
          endDate: fromSupabase.endDate ?? localVersion.endDate,
          routineGroupName: fromSupabase.routineGroupName ?? localVersion.routineGroupName,
        };
      }
      return fromSupabase;
    });

    const merged = [...routines, ...unsyncedLocals];

    // Process agenda_events (already fetched in parallel above)
    try {
      const { data: cloudEvents } = agendaResult;

      if (cloudEvents && cloudEvents.length > 0) {
        for (const ev of cloudEvents) {
          if (ev.type === 'deleted_routine') {
            if (ev.notes) deletedSet.add(ev.notes.toLowerCase().trim());
          }
        }
        cacheStorage.setRemoteItem('cadu_ponce_deleted_routines', JSON.stringify(Array.from(deletedSet)));

        for (const ev of cloudEvents) {
          if (ev.type === 'assigned_routine' && ev.notes) {
            try {
              const parsed: AdminRoutine = JSON.parse(ev.notes);
              if (parsed && parsed.name && !isDeleted(parsed.id)) {
                const existingIdx = merged.findIndex(r => r.id === parsed.id);
                if (existingIdx === -1) {
                  merged.push(parsed);
                }
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('agenda_events routine cloud sync error:', e);
    }

    // Clean out deleted routines and workouts from local caches
    const finalRoutines = merged.filter(r => !isDeleted(r.id));
    if (completeSnapshot) cacheStorage.setRemoteItem('cadu_ponce_admin_routines', JSON.stringify(finalRoutines));

    const cleanWorkouts = cacheStorage.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []).filter(w => !isDeleted(w.id));
    if (completeSnapshot) cacheStorage.setRemoteItem(CACHE_KEYS.WORKOUTS, JSON.stringify(cleanWorkouts));

    return finalRoutines;
  },


  /** Returns cached routines (sync, used while async fetch is in-flight). */
  getAdminRoutines: (): AdminRoutine[] => {
    return cacheStorage.readJson<AdminRoutine[]>('cadu_ponce_admin_routines', []);
  },

  /** Save a prescription to its dedicated tables, with failures visible to callers. */
  saveAdminRoutine: async (routine: AdminRoutine): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const cache = cacheForUser(getCacheUser());
    const { error } = await supabase.from('admin_routines').upsert({
      id: routine.id, name: routine.name, goal: routine.goal ?? '', difficulty: routine.difficulty ?? '',
      day_of_week: routine.dayOfWeek ?? null, muscle_group: routine.muscleGroup ?? null,
      general_notes: routine.generalNotes ?? null, notes: routine.notes ?? null,
      student_ids: routine.studentIds ?? [], student_names: routine.studentNames ?? [],
      start_date: routine.startDate ?? null, end_date: routine.endDate ?? null, routine_group_name: routine.routineGroupName ?? null,
    });
    if (error) throw error;
    const { data: existing, error: readError } = await supabase.from('admin_exercises').select('id').eq('routine_id', routine.id);
    if (readError) throw readError;
    const existingIds = new Set((existing ?? []).map(row => row.id));
    const rows = routine.exercises.map((exercise, index) => {
      const id = existingIds.has(exercise.id) ? exercise.id : crypto.randomUUID();
      exercise.id = id;
      return { id, routine_id: routine.id, name: exercise.name, sets: exercise.sets, reps: exercise.reps,
        rest: exercise.rest ?? '60s', notes: exercise.notes ?? null, video_url: exercise.videoUrl ?? null,
        video_file_url: exercise.videoFileUrl ?? null, combined_with_next: exercise.combinedWithNext ?? false,
        combined_group: exercise.combinedGroup ?? null, prescribed_loads: exercise.prescribedLoads ?? null, sort_order: index };
    });
    if (rows.length) {
      const { error } = await supabase.from('admin_exercises').upsert(rows);
      if (error) throw error;
    }
    const kept = new Set(rows.map(row => row.id));
    const removed = [...existingIds].filter(id => !kept.has(id));
    if (removed.length) {
      const { error } = await supabase.from('admin_exercises').delete().eq('routine_id', routine.id).in('id', removed);
      if (error) throw error;
    }
    const all = cache.readJson<AdminRoutine[]>('cadu_ponce_admin_routines', []);
    cache.setRemoteItem('cadu_ponce_admin_routines', JSON.stringify([routine, ...all.filter(r => r.id !== routine.id)]), { preserveLocal: true });
  },

  saveAdminRoutines: async (routines: AdminRoutine[]): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    for (const routine of routines) await storage.saveAdminRoutine(routine);
  },

  deleteAdminRoutine: async (id: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const cache = cacheForUser(getCacheUser());
    // Remove only copies carrying this stable relationship. Legacy same-name
    // workouts are intentionally preserved until their relationship is known.
    const { data, error } = await supabase.rpc('delete_admin_routine', { p_routine_id: id });
    if (error) throw error;
    if (!data) throw new Error('Rotina não encontrada. Atualize a lista.');
    const routines = cache.readJson<AdminRoutine[]>('cadu_ponce_admin_routines', []);
    cache.setRemoteItem('cadu_ponce_admin_routines', JSON.stringify(routines.filter(r => r.id !== id)), { preserveLocal: true });
    const workouts = cache.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []);
    cache.setRemoteItem(CACHE_KEYS.WORKOUTS, JSON.stringify(workouts.filter(w => w.routineId !== id)), { preserveLocal: true });
  },

  fetchAgendaEvents: async (): Promise<any[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('agenda_events')
      .select('*')
      .neq('type', 'media_storage');
      
    if (error || !data) {
      return cacheStorage.readJson<any[]>('cp_agenda_events', []).filter(event => event.type !== 'media_storage');
    }
    
    const events = data.filter(row => row.type !== 'media_storage').map(row => ({
      id: row.id,
      studentId: row.student_id,
      studentName: row.student_name,
      title: row.title,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      type: row.type,
      notes: row.notes,
      createdAt: row.created_at
    }));
    
    cacheStorage.setRemoteItem('cp_agenda_events', JSON.stringify(events));
    return events;
  },

  getAgendaEvents: (): any[] => {
    return cacheStorage.readJson<any[]>('cp_agenda_events', []).filter(event => event.type !== 'media_storage');
  },

  saveAgendaEvent: async (event: any): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('agenda_events').upsert({
      id: event.id,
      student_id: event.studentId || null,
      student_name: event.studentName || null,
      title: event.title,
      date: event.date,
      start_time: event.startTime,
      end_time: event.endTime,
      type: event.type,
      notes: event.notes || null,
      created_at: event.createdAt
    });
    
    if (error) throw error;

    // Update local cache
    const events = cacheStorage.readJson<any[]>('cp_agenda_events', []).filter(item => item.type !== 'media_storage');
    const existingIdx = events.findIndex((e: any) => e.id === event.id);
    if (existingIdx >= 0) {
      events[existingIdx] = event;
    } else {
      events.push(event);
    }
    cacheStorage.setRemoteItem('cp_agenda_events', JSON.stringify(events));
  },

  deleteAgendaEvent: async (id: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('agenda_events').delete().eq('id', id);
    if (error) throw error;
    
    const events = cacheStorage.readJson<any[]>('cp_agenda_events', []).filter(event => event.type !== 'media_storage');
    const newEvents = events.filter((e: any) => e.id !== id);
    cacheStorage.setRemoteItem('cp_agenda_events', JSON.stringify(newEvents));
  },

  // ── Custom Exercises (Biblioteca de Exercícios) ───────────────────────────

  /** Read confirmed cloud rows while preserving explicitly unsaved legacy drafts. */
  fetchCustomExercises: async (): Promise<LibraryExercise[]> => {
    const cache = cacheForUser(getCacheUser());
    const { data, error } = await supabase.from('custom_exercises').select('*').order('created_at', { ascending: false });
    const local = readLibraryCache(cache);
    if (error || !data) return local.all;
    const remote: LibraryExercise[] = data.map(row => ({
      id: row.id, title: row.title, group: row.group ?? '', category: row.category ?? '',
      videoUrl: row.video_url ?? undefined, videoFileUrl: row.video_file_url ?? undefined,
      image: row.image ?? '', description: row.description ?? '', isCustom: row.is_custom ?? true,
      isFavorite: local.favorites[row.id] ?? local.all.find(item => item.id === row.id)?.isFavorite ?? false,
      syncStatus: 'synced',
    }));
    const remoteIds = new Set(remote.map(item => item.id));
    // A legacy same-ID draft may contain images/notes that the old client never
    // uploaded. Back it up too; never erase it just because that ID exists remotely.
    const drafts = local.all.filter(item => item.syncStatus !== 'synced' &&
      (!remoteIds.has(item.id) || hasExerciseChanges(item, remote.find(row => row.id === item.id)!)))
      .map(item => ({ ...item, syncStatus: 'pending' as const }));
    storeLibrarySnapshot(cache, remote, drafts);
    const visible = remote.map(item => {
      const draft = drafts.find(localItem => localItem.id === item.id);
      if (!draft) return item;
      return { ...item, ...draft, syncStatus: 'pending' as const };
    });
    return [...visible, ...drafts.filter(item => !remoteIds.has(item.id))];
  },

  /** Confirm database persistence before changing the visible library or its cache. */
  saveCustomExercise: async (exercise: LibraryExercise): Promise<void> => {
    const cache = cacheForUser(getCacheUser());
    const saved: LibraryExercise = { ...exercise,
      image: normalizeStoredMediaReference(exercise.image) ?? '',
      videoUrl: normalizeStoredMediaReference(exercise.videoUrl) ?? undefined,
      videoFileUrl: normalizeStoredMediaReference(exercise.videoFileUrl) ?? undefined,
      syncStatus: 'synced',
    };
    const { data, error } = await supabase.from('custom_exercises').upsert({
      id: saved.id, title: saved.title, group: saved.group, category: saved.category,
      video_url: saved.videoUrl ?? null, video_file_url: saved.videoFileUrl ?? null,
      image: saved.image || null, description: saved.description ?? '', is_custom: saved.isCustom,
    }).select('id').single();
    if (error) throw error;
    if (!data?.id) throw new Error('Não foi possível confirmar o salvamento do exercício. Tente novamente.');
    const local = readLibraryCache(cache);
    const others = local.all.filter(item => item.id !== saved.id);
    const cached = storeLibrarySnapshot(cache, [saved, ...others.filter(item => item.syncStatus === 'synced')],
      others.filter(item => item.syncStatus !== 'synced'));
    Object.assign(exercise, saved);
    if (!cached && local.all.some(item => item.id === saved.id && item.syncStatus !== 'synced' && hasExerciseChanges(item, saved))) {
      throw new Error('O exercício foi salvo na nuvem, mas o rascunho antigo não pôde ser atualizado neste dispositivo. Libere espaço e salve novamente.');
    }
  },

  deleteCustomExercise: async (id: string): Promise<void> => {
    const cache = cacheForUser(getCacheUser());
    const { error } = await supabase.from('custom_exercises').delete().eq('id', id);
    if (error) throw error;
    const remaining = readLibraryCache(cache).all.filter(item => item.id !== id);
    try {
      markLibraryExerciseDeleted(cache, id);
    } catch {
      throw new Error('Exercício removido da nuvem, mas não foi possível registrar a remoção do rascunho neste dispositivo. Libere espaço e tente novamente.');
    }
    storeLibrarySnapshot(cache, remaining.filter(item => item.syncStatus === 'synced'),
      remaining.filter(item => item.syncStatus !== 'synced'));
  },

  // ── Muscle Groups & Categories ────────────────────────────────────────────

  fetchMuscleGroups: async (): Promise<string[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('muscle_groups')
      .select('name')
      .order('id', { ascending: true });

    if (error || !data) return cacheStorage.readJson<string[]>('cadu_ponce_muscle_groups', ['Abdômen', 'Pernas', 'Peito', 'Ombros', 'Costas', 'Braços', 'Cardio', 'Core']);
    const groups = data.map(r => r.name as string);
    cacheStorage.setRemoteItem('cadu_ponce_muscle_groups', JSON.stringify(groups));
    return groups;
  },

  getMuscleGroups: (): string[] => {
    return cacheStorage.readJson<string[]>('cadu_ponce_muscle_groups', ['Abdômen', 'Pernas', 'Peito', 'Ombros', 'Costas', 'Braços', 'Cardio', 'Core']);
  },

  addMuscleGroup: (name: string): Promise<string[]> => changeNamedValue('muscle_groups', name, false),
  removeMuscleGroup: (name: string): Promise<string[]> => changeNamedValue('muscle_groups', name, true),

  fetchCategories: async (): Promise<string[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('exercise_categories')
      .select('name')
      .order('id', { ascending: true });

    if (error || !data) return cacheStorage.readJson<string[]>('cadu_ponce_categories', ['Musculação', 'Funcional', 'Alongamento']);
    const cats = data.map(r => r.name as string);
    cacheStorage.setRemoteItem('cadu_ponce_categories', JSON.stringify(cats));
    return cats;
  },

  getCategories: (): string[] => {
    return cacheStorage.readJson<string[]>('cadu_ponce_categories', ['Musculação', 'Funcional', 'Alongamento']);
  },

  addCategory: (name: string): Promise<string[]> => changeNamedValue('exercise_categories', name, false),
  removeCategory: (name: string): Promise<string[]> => changeNamedValue('exercise_categories', name, true),

  uploadExerciseVideo: async (file: File, exerciseId: string): Promise<string> => {
    const cacheStorage = cacheForUser(getCacheUser());
    if (!/^(video\/(mp4|webm|quicktime)|image\/(jpeg|png|webp|gif))$/.test(file.type)) {
      throw new Error('Use vídeo MP4, WebM ou MOV, ou imagem JPG, PNG, WebP ou GIF.');
    }
    if (file.size > 100 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 100 MB.');
    const extension = (file.name.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '');
    const path = `exercises/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('exercise-videos').upload(path, file, { contentType: file.type });
    if (error) throw new Error(`Não foi possível enviar o arquivo: ${error.message}`);
    return toStorageReference('exercise-videos', path);
  },

  // ── Legacy shims (kept for backward compat) ───────────────────────────────
  getUsersListSync: (): UserProfile[] => storage.getUsersList(),
  /** @deprecated no-op — data now goes directly to dedicated tables */
  syncAdminData: async (): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser()); /* no-op */ },
  /** @deprecated no-op shim */
  fetchAdminData: async (): Promise<null> => null,

  // ── Workout completion and administrator notifications ──────────────────

  WORKOUT_LOGS_KEY: 'cadu_workout_logs',

  /** A durable completion marks the local day; the database creates notices atomically. */
  saveWorkoutLog: async (log: WorkoutLog): Promise<WorkoutLog> => {
    const actor = getCacheUser();
    if (!actor) throw new Error('Entre na sua conta para registrar o treino.');
    const cache = cacheForUser(actor);
    const previous = cache.readJson<WorkoutLog[]>('cadu_workout_logs', []).find(item => item.id === log.id);
    let entry: WorkoutLog = { ...log, syncStatus: 'pending', syncError: undefined,
      notificationStatus: previous?.notificationStatus === 'sent' ? 'sent' : 'pending' };
    const saveCache = () => {
      const all = cache.readJson<WorkoutLog[]>('cadu_workout_logs', []);
      const merged = [entry, ...all.filter(item => item.id !== entry.id)];
      if (entry.syncStatus === 'pending') persistOutbox(cache, 'cadu_workout_logs', merged);
      else cache.setRemoteItem('cadu_workout_logs', JSON.stringify(merged), { preserveLocal: true });
    };
    saveCache();
    emitWorkoutChange(entry, actor);
    try {
      if (actor !== getCacheUser()) throw new Error('A sessão mudou.');
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Sem conexão. Treino salvo neste dispositivo.');
      const { error } = await supabase.from('workout_logs').upsert({
        id: log.id, student_id: log.studentId, student_name: log.studentName ?? null,
        routine_id: log.routineId, routine_name: log.routineName, completed_at: log.completedAt,
        duration_seconds: log.durationSeconds, rpe: log.rpe, exercises_summary: log.exercisesSummary,
        comment: log.comment ?? null,
      });
      if (error) throw error;
      entry = { ...entry, syncStatus: 'synced', syncError: undefined };
    } catch (error) {
      entry = { ...entry, syncError: error instanceof Error ? error.message : 'Sincronização pendente. Tentaremos novamente ao conectar.' };
    }
    saveCache();
    emitWorkoutChange(entry, actor);
    if (entry.syncStatus === 'synced') {
      if (typeof window !== 'undefined' && actor === getCacheUser()) window.dispatchEvent(new Event('cadu_data_synced'));
      if (entry.notificationStatus !== 'sent') void requestCompletionPush(log.id, actor);
    }
    return entry;
  },

  getWorkoutLogs: (): WorkoutLog[] => readCached<WorkoutLog[]>('cadu_workout_logs', []),

  fetchWorkoutLogs: async (studentId: string, range: LogRange = {}): Promise<WorkoutLog[]> => {
    const actor = getCacheUser();
    const cache = cacheForUser(actor);
    const startingValues = new Map(cache.readJson<WorkoutLog[]>('cadu_workout_logs', []).map(log => [log.id, JSON.stringify(log)]));
    let remote: WorkoutLog[];
    try { remote = await queryWorkoutLogs(studentId, range); }
    catch (error) {
      if (range.allowCached === false) throw error;
      return cache.readJson<WorkoutLog[]>('cadu_workout_logs', []).filter(log => log.studentId === studentId && inLogRange(log, range));
    }
    // Read after the request so a newly completed offline session cannot be lost.
    const latest = cache.readJson<WorkoutLog[]>('cadu_workout_logs', []);
    const pending = latest.filter(log => log.studentId === studentId && inLogRange(log, range) &&
      (log.syncStatus === 'pending' || startingValues.get(log.id) !== JSON.stringify(log)));
    const pendingIds = new Set(pending.map(log => log.id));
    const logs = remote.map(log => ({ ...log, notificationStatus: latest.find(item => item.id === log.id)?.notificationStatus ?? 'sent' as const }));
    const merged = [...pending, ...logs.filter(log => !pendingIds.has(log.id))];
    const mergedIds = new Set(merged.map(log => log.id));
    const others = latest.filter(log => !mergedIds.has(log.id) && (log.studentId !== studentId || !inLogRange(log, range)));
    cache.setRemoteItem('cadu_workout_logs', JSON.stringify([...others, ...merged]), { preserveLocal: true });
    return merged;
  },

  /** Administrator reporting uses actual server rows, never a successful-looking fallback. */
  fetchWorkoutLogsRange: async (from: string, to: string): Promise<WorkoutLog[]> => {
    if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) {
      throw new Error('Período de frequência inválido.');
    }
    return queryWorkoutLogs(undefined, { from, to });
  },

  syncPendingData: async (userId: string): Promise<void> => {
    if (userId !== getCacheUser()) return;
    const profile = storage.getUser();
    const canSync = (studentId: string) => studentId === userId || profile?.role === 'admin';
    for (const log of storage.getWorkoutLogs().filter(log => log.syncStatus === 'pending' && canSync(log.studentId))) {
      if (userId !== getCacheUser()) return;
      await storage.saveWorkoutLog(log);
    }
    for (const photo of storage.getPhotos().filter(photo => (photo.syncStatus === 'pending' || photo.photoURL.startsWith('idb:')) && canSync(photo.studentId))) {
      if (userId !== getCacheUser()) return;
      try { await storage.savePhoto(photo); } catch { /* Keep the durable file and pending record. */ }
    }
    // Failed device delivery is independent of the already persisted in-app notice.
    const notifications = storage.getWorkoutLogs().filter(log => log.syncStatus === 'synced' && log.notificationStatus === 'pending' && canSync(log.studentId));
    for (const log of notifications.slice(0, 10)) {
      if (userId !== getCacheUser()) return;
      await requestCompletionPush(log.id, userId);
    }
    if (typeof window !== 'undefined' && userId === getCacheUser()) window.dispatchEvent(new Event('cadu_data_synced'));
  },

  /** Compatibility wrapper: recipients and message are always derived on the server. */
  notifyTrainerWorkoutCompleted: async (details: {
    logId?: string; studentId: string; studentName: string; studentPhone?: string;
    routineName: string; durationFormatted: string; durationSeconds: number;
  }): Promise<void> => {
    const actor = getCacheUser();
    if (!actor || !details.logId) throw new Error('Conclua e salve o treino antes de enviar o aviso.');
    const log = readCached<WorkoutLog[]>('cadu_workout_logs', [], actor).find(item => item.id === details.logId);
    if (!log || log.syncStatus !== 'synced') throw new Error('O treino ainda aguarda sincronização.');
    if (!await requestCompletionPush(log.id, actor)) throw new Error('O treino foi salvo; o aviso no dispositivo será tentado novamente.');
  },

  fetchTrainerNotifications: async (): Promise<TrainerNotification[]> => {
    const actor = getCacheUser();
    if (!actor) throw new Error('Entre novamente para consultar as notificações.');
    const { data: recent, error } = await supabase.from('workout_completion_notifications').select('*')
      .eq('recipient_id', actor).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    if (!recent) throw new Error('Não foi possível carregar as notificações.');
    // Include every unread notice even when it is older than the recent history window.
    const rows = new Map(recent.map(row => [row.id, row]));
    for (let offset = 0; ; offset += 500) {
      const { data: unread, error: unreadError } = await supabase.from('workout_completion_notifications').select('*')
        .eq('recipient_id', actor).is('read_at', null).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
      if (unreadError) throw unreadError;
      if (!unread) throw new Error('Não foi possível carregar as notificações pendentes.');
      unread.forEach(row => rows.set(row.id, row));
      if (unread.length < 500) break;
    }
    const notifications: TrainerNotification[] = [...rows.values()].map(row => {
      const completedAt = row.completed_at || row.created_at;
      const duration = `${Math.floor((Number(row.duration_seconds) || 0) / 60)} min`;
      return { id: row.id, logId: row.workout_log_id, studentId: row.student_id,
        studentName: row.student_name || 'Aluno', workoutTitle: row.routine_name || 'Treino', duration,
        timestamp: new Date(completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        fullDate: row.created_at, completedAt, isRead: !!row.read_at, type: 'completion' as const,
        detailMessage: `${row.student_name || 'Aluno'} concluiu "${row.routine_name || 'Treino'}". Duração: ${duration}.` };
    }).sort((a, b) => Date.parse(b.fullDate) - Date.parse(a.fullDate));
    cacheForUser(actor).setRemoteItem('cadu_notifs_admin', JSON.stringify(notifications));
    return notifications;
  },

  markTrainerNotificationRead: async (id: string): Promise<void> => {
    const actor = getCacheUser();
    if (!actor) throw new Error('Entre novamente para atualizar a notificação.');
    const { data, error } = await supabase.from('workout_completion_notifications')
      .update({ read_at: new Date().toISOString() }).eq('id', id).eq('recipient_id', actor).select('id').single();
    if (error) throw error;
    if (!data?.id) throw new Error('A notificação não foi encontrada para esta conta.');
    const cache = cacheForUser(actor);
    const items = cache.readJson<TrainerNotification[]>('cadu_notifs_admin', []);
    cache.setRemoteItem('cadu_notifs_admin', JSON.stringify(items.map(item => item.id === id ? { ...item, isRead: true } : item)));
    if (actor === getCacheUser() && typeof window !== 'undefined') window.dispatchEvent(new Event('cadu_notifications_changed'));
  },

  // ── Financial / Pendências & Faturas 100% Manuais e Editáveis ───────────────

  /** Busca todas as faturas e pendências financeiras registradas no Supabase */
  fetchFinancialInvoices: async (): Promise<FinancialInvoice[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    try {
      const { data, error } = await supabase
        .from('agenda_events')
        .select('*')
        .eq('type', 'financial_invoice')
        .order('date', { ascending: true });

      if (!error && data) {
        const invoices: FinancialInvoice[] = data.map(row => {
          let extra: any = {};
          try { extra = JSON.parse(row.notes || '{}'); } catch {}
          return {
            id: row.id,
            studentId: row.student_id ?? extra.studentId,
            studentName: row.student_name || extra.studentName || 'Aluno',
            studentPhone: extra.studentPhone || '',
            amount: Number(row.start_time) || Number(extra.amount) || 0,
            dueDate: row.date,
            paymentMethod: row.end_time || extra.paymentMethod || 'PIX',
            status: extra.status === 'paid' ? 'paid' : 'pending',
            description: row.title || extra.description || 'Mensalidade',
            paidAt: extra.paidAt,
            createdAt: row.created_at,
          };
        });
        cacheStorage.setRemoteItem('cadu_financial_invoices', JSON.stringify(invoices));
        return invoices;
      }
    } catch (e) {
      console.warn('Erro ao carregar faturas do Supabase:', e);
    }

    try {
      const cached = cacheStorage.getItem('cadu_financial_invoices');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  },

  /** Salva ou atualiza uma fatura no Supabase com sincronização total */
  saveFinancialInvoice: async (invoice: FinancialInvoice): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const payload = {
      id: invoice.id,
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      studentPhone: invoice.studentPhone,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      paymentMethod: invoice.paymentMethod,
      status: invoice.status,
      description: invoice.description,
      paidAt: invoice.paidAt,
    };

    const { error } = await supabase.from('agenda_events').upsert({
        id: invoice.id,
        student_id: invoice.studentId || null,
        student_name: invoice.studentName,
        title: invoice.description,
        date: invoice.dueDate,
        start_time: String(invoice.amount),
        end_time: invoice.paymentMethod,
        type: 'financial_invoice',
        notes: JSON.stringify(payload),
    });
    if (error) throw error;
    const cached = cacheStorage.readJson<FinancialInvoice[]>('cadu_financial_invoices', []);
    const filtered = cached.filter(i => i.id !== invoice.id);
    cacheStorage.setRemoteItem('cadu_financial_invoices', JSON.stringify([...filtered, invoice]));
  },

  /** Exclui uma fatura do Supabase e do cache */
  deleteFinancialInvoice: async (id: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('agenda_events').delete().eq('id', id);
    if (error) throw error;
    const cached = cacheStorage.readJson<FinancialInvoice[]>('cadu_financial_invoices', []);
    cacheStorage.setRemoteItem('cadu_financial_invoices', JSON.stringify(cached.filter(i => i.id !== id)));
  },

  // ── Formas de Pagamento Configuráveis pelo Personal ─────────────────────────

  /** Busca as configurações de pagamento do personal */
  fetchPaymentSettings: async (): Promise<TrainerPaymentSettings> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const defaultSettings: TrainerPaymentSettings = {
      pixKey: '554384639369',
      pixType: 'Telefone',
      pixHolder: 'Carlos Eduardo Ponce',
      bankName: '',
      cardLink: '',
      instructions: 'Envie o comprovante no WhatsApp após realizar o pagamento.',
    };

    try {
      const { data, error } = await supabase
        .from('agenda_events')
        .select('notes')
        .eq('id', '00000000-0000-4000-8000-000000000002')
        .single();

      if (!error && data?.notes) {
        const parsed = JSON.parse(data.notes);
        cacheStorage.setRemoteItem('cadu_trainer_payment_settings', JSON.stringify(parsed));
        return { ...defaultSettings, ...parsed };
      }
    } catch {}

    try {
      const cached = cacheStorage.getItem('cadu_trainer_payment_settings');
      if (cached) return { ...defaultSettings, ...JSON.parse(cached) };
    } catch {}

    return defaultSettings;
  },

  /** Salva as configurações de pagamento do personal no Supabase */
  savePaymentSettings: async (settings: TrainerPaymentSettings): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('agenda_events').upsert({
        id: '00000000-0000-4000-8000-000000000002',
        title: 'Configurações de Pagamento',
        date: '2026-01-01',
        start_time: '00:00',
        end_time: '00:00',
        type: 'trainer_payment_settings',
        notes: JSON.stringify(settings),
    });
    if (error) throw error;
    cacheStorage.setRemoteItem('cadu_trainer_payment_settings', JSON.stringify(settings));
  },
};
