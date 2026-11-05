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
import { Workout, ProgressEntry, EvolutionPhoto, UserProfile, AdminRoutine, AdminExercise, WorkoutLog, FinancialInvoice, TrainerPaymentSettings, Assessment, Anamnesis, StudentFile, WorkoutFeedback, StudentNotification, AgendaEvent } from '../types';
import { storeLocalFile, compressImage, resolveMediaUrl, getLocalBlob, toStorageReference, clearMediaCache, normalizeStoredMediaReference, deleteLocalFile, deleteStoredMedia } from './mediaDb';
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
type PhotoDeletion = { id: string; studentId: string; reference?: string; localFileKey?: string; pending: boolean };
const PHOTO_DELETIONS = 'cadu_deleted_photos';
const photoWrites = new Map<string, Promise<unknown>>();
function photoDeletions(actor = getCacheUser()): PhotoDeletion[] { return cacheForUser(actor).readJson(PHOTO_DELETIONS, []); }
function photoDeleted(id: string, actor: string | null): boolean { return photoDeletions(actor).some(item => item.id === id); }
function requireActor(): string {
  const actor = getCacheUser();
  if (!actor) throw new Error('Entre na sua conta para continuar.');
  return actor;
}
function assertActor(actor: string): void { if (getCacheUser() !== actor) throw new Error('A sessão mudou. Entre novamente para continuar.'); }
function mutationError(error: { code?: string; message?: string }): Error {
  return new Error(error.code === '40001' ? 'Este registro mudou ou foi excluído. Recarregue antes de salvar.' : error.message || 'Não foi possível salvar.');
}
async function removeUnusedMedia(reference: string, actor: string): Promise<void> {
  if (!reference.startsWith('storage://')) return;
  assertActor(actor);
  const { data: used, error } = await supabase.rpc('media_reference_in_use', { p_reference: reference });
  if (error || typeof used !== 'boolean') throw error ?? new Error('Não foi possível verificar as referências do arquivo.');
  if (!used) await deleteStoredMedia(reference, actor);
}
async function readAllRows(makeQuery: () => any): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await makeQuery().range(offset, offset + 99);
    if (error || !Array.isArray(data)) throw error ?? new Error('Não foi possível carregar todos os registros.');
    rows.push(...data);
    if (data.length < 100) return rows;
  }
}
async function prescriptionRows(kind: 'routine' | 'workout', studentId?: string): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.rpc('read_prescriptions', { p_kind: kind, p_offset: offset, p_limit: 100, p_student_id: studentId ?? null });
    if (error || !Array.isArray(data)) throw error ?? new Error('Não foi possível carregar a prescrição completa.');
    rows.push(...data);
    if (data.length < 100) return rows;
  }
}
function prescriptionSettings(value: AdminRoutine | Workout): Record<string, unknown> {
  return { kind: value.kind ?? 'strength', hideBeforeStart: value.hideBeforeStart ?? false,
    hideAfterEnd: value.hideAfterEnd ?? false, allowPdf: value.allowPdf ?? true, showTimer: value.showTimer ?? true,
    startDate: value.startDate ?? null, endDate: value.endDate ?? null };
}
function exercisePayload(exercise: AdminExercise | Workout['exercises'][number]) {
  return { id: exercise.id || crypto.randomUUID(), name: exercise.name, sets: exercise.sets, reps: exercise.reps,
    rest: exercise.rest ?? '60s', notes: exercise.notes ?? null,
    current_load: 'currentLoad' in exercise ? exercise.currentLoad ?? 0 : 0,
    video_url: normalizeStoredMediaReference(exercise.videoUrl), video_file_url: normalizeStoredMediaReference(exercise.videoFileUrl),
    combined_with_next: exercise.combinedWithNext ?? false, combined_group: exercise.combinedGroup ?? null,
    prescribed_loads: exercise.prescribedLoads ?? null };
}
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
      videoUrl: (e.video_url as string) ?? undefined, videoFileUrl: (e.video_file_url as string) ?? undefined,
      combinedWithNext: (e.combined_with_next as boolean) ?? false, combinedGroup: (e.combined_group as string) ?? undefined,
    }));

  return {
    id: row.id as string,
    version: Number(row.version),
    ...(row.settings as Record<string, unknown> ?? {}),
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
    version: Number(row.version),
    ...(row.settings as Record<string, unknown> ?? {}),
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
    let data: any[] | null = null, error: unknown;
    try { data = await readAllRows(() => supabase.from('profiles').select('*').order('created_at', { ascending: false }).order('id')); }
    catch (failure) { error = failure; }

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
      .eq('role', user.role)
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

  fetchWorkouts: async (studentId?: string, options: { allowCached?: boolean } = {}): Promise<Workout[]> => {
    const actor = requireActor(), cache = cacheForUser(actor);
    try {
      const workouts = (await prescriptionRows('workout', studentId)).map(rowToWorkout);
      assertActor(actor);
      const others = studentId ? cache.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []).filter(w => w.studentId !== studentId) : [];
      cache.setRemoteItem(CACHE_KEYS.WORKOUTS, JSON.stringify([...others, ...workouts]));
      return workouts;
    } catch (error) {
      if (!options.allowCached) throw error;
      return cache.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []).filter(w => !studentId || w.studentId === studentId);
    }
  },

  saveWorkout: async (workout: Workout): Promise<void> => {
    const actor = requireActor(), cache = cacheForUser(actor);
    const payload = { id: workout.id, name: workout.name, description: workout.description ?? null,
      student_id: workout.studentId, routine_id: workout.routineId ?? null, settings: prescriptionSettings(workout),
      exercises: workout.exercises.map(ex => exercisePayload({ ...ex,
        id: workout.version && /^[0-9a-f-]{36}$/i.test(ex.id) ? ex.id : crypto.randomUUID() })) };
    const { data, error } = await supabase.rpc('save_workout', { p_payload: payload, p_expected_version: workout.version ?? null });
    if (error) throw mutationError(error);
    if (!data?.id || !data.version) throw new Error('Não foi possível confirmar a gravação completa do treino. Recarregue antes de tentar novamente.');
    const saved = rowToWorkout(data);
    Object.assign(workout, saved);
    const all = cache.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []);
    cache.setRemoteItem(CACHE_KEYS.WORKOUTS, JSON.stringify([saved, ...all.filter(w => w.id !== saved.id)]));
    assertActor(actor);
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
    const data = await readAllRows(() => supabase.from('progress_entries').select('*').eq('student_id', studentId).order('date', { ascending: false }).order('id'));

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
    cacheStorage.setRemoteItem(CACHE_KEYS.PROGRESS, JSON.stringify([entry, ...all.filter(item => item.id !== entry.id)]));
  },

  // ── Evolution Photos ──────────────────────────────────────────────────────

  getPhotos: (): EvolutionPhoto[] => readCached<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, []).filter(photo => !photoDeleted(photo.id, getCacheUser())),

  fetchPhotos: async (studentId: string): Promise<EvolutionPhoto[]> => {
    const actor = requireActor(), cache = cacheForUser(actor);
    const initial = new Map(cache.readJson<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, []).map(photo => [photo.id, JSON.stringify(photo)]));
    const data = await readAllRows(() => supabase.from('evolution_photos').select('*').eq('student_id', studentId).order('id'));
    const remote: EvolutionPhoto[] = data.map(row => ({ id: row.id, studentId: row.student_id, photoURL: row.photo_url, notes: row.notes ?? undefined, date: row.date, syncStatus: 'synced' }));
    const legacy = await readAllRows(() => supabase.from('agenda_events').select('*').eq('type', 'evolution_photo').eq('student_id', studentId).order('id'));
    for (const row of legacy) {
      try { const item = JSON.parse(row.notes ?? '{}');
        if (!remote.some(p => p.id === row.id) && typeof item.photoURL === 'string' && !/^(blob:|idb:)/.test(item.photoURL))
          remote.push({ id: row.id, studentId, photoURL: item.photoURL, date: item.date || row.created_at, notes: item.notes, syncStatus: 'synced' });
      } catch { /* Keep malformed legacy rows on the server for review. */ }
    }
    assertActor(actor);
    const latest = cache.readJson<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, []);
    const changed = latest.filter(photo => photo.studentId === studentId &&
      (photo.syncStatus === 'pending' || photo.photoURL.startsWith('idb:') || initial.get(photo.id) !== JSON.stringify(photo)));
    const changedIds = new Set(changed.map(photo => photo.id));
    const merged = [...changed, ...remote.filter(photo => !changedIds.has(photo.id))].filter(photo => !photoDeleted(photo.id, actor));
    cache.setRemoteItem(CACHE_KEYS.PHOTOS, JSON.stringify([...latest.filter(photo => photo.studentId !== studentId), ...merged]), { preserveLocal: true });
    return merged;
  },

  savePhoto: async (photo: EvolutionPhoto, file?: File): Promise<string> => {
    const actor = requireActor(), key = actor + ':' + photo.id, cache = cacheForUser(actor);
    const previous = photoWrites.get(key);
    const operation = (async () => {
      if (previous) await previous.catch(() => {});
      if (photoDeleted(photo.id, actor)) throw new Error('Esta foto foi excluída. Selecione um novo arquivo.');
      let localKey = photo.localFileKey || (photo.photoURL.startsWith('idb:') ? photo.photoURL : undefined);
      let uploadBlob: Blob | null = file ?? null;
      if (file) {
        if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
        if (file.size > 20 * 1024 * 1024) throw new Error('A foto deve ter no máximo 20 MB.');
        uploadBlob = await compressImage(file, 1600, 0.85);
        localKey = await storeLocalFile(uploadBlob, 'photo_' + photo.id);
      } else if (localKey) {
        uploadBlob = await getLocalBlob(localKey);
        if (!uploadBlob && photo.syncStatus === 'synced' && photo.photoURL.startsWith('storage://')) localKey = undefined;
        else if (!uploadBlob) throw new Error('O arquivo local não foi encontrado. Selecione a foto novamente.');
      }
      let reference = uploadBlob ? (localKey || '') : photo.photoURL;
      if (!reference || reference.startsWith('blob:')) throw new Error('Selecione a foto novamente para salvá-la.');
      let current: EvolutionPhoto = { ...photo, photoURL: reference, localFileKey: localKey, syncStatus: 'pending', syncError: undefined };
      const assertNotDeleted = () => { if (photoDeleted(photo.id, actor)) throw new Error('Esta foto foi excluída.'); };
      const saveCache = () => {
        assertNotDeleted();
        const entries = [current, ...cache.readJson<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, []).filter(p => p.id !== photo.id)];
        if (current.syncStatus === 'pending') { persistOutbox(cache, CACHE_KEYS.PHOTOS, entries); return true; }
        return cache.setRemoteItem(CACHE_KEYS.PHOTOS, JSON.stringify(entries), { preserveLocal: true });
      };
      saveCache();
      try {
        assertActor(actor); assertNotDeleted();
        if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Sem conexão. A foto será enviada quando a conexão voltar.');
        if (uploadBlob) {
          const extension = uploadBlob.type === 'image/png' ? 'png' : uploadBlob.type === 'image/webp' ? 'webp' : 'jpg';
          const path = photo.studentId + '/' + photo.id + '.' + extension;
          const { error } = await supabase.storage.from('evolution-photos').upload(path, uploadBlob, { upsert: true, contentType: uploadBlob.type });
          if (error) throw error;
          reference = toStorageReference('evolution-photos', path);
        }
        assertActor(actor); assertNotDeleted();
        if (/^(idb:|blob:|data:)/.test(reference)) throw new Error('A foto ainda não foi enviada ao armazenamento.');
        const { error } = await supabase.from('evolution_photos').upsert({ id: photo.id, student_id: photo.studentId, photo_url: reference, notes: photo.notes ?? null, date: photo.date });
        if (error) throw error;
        current = { ...current, photoURL: reference, syncStatus: 'synced', syncError: undefined, localFileKey: localKey };
      } catch (error) {
        if (photoDeleted(photo.id, actor)) {
          if (reference.startsWith('storage://')) await removeUnusedMedia(reference, actor).catch(() => {});
          if (localKey) await deleteLocalFile(localKey, actor).catch(() => {});
          throw new Error('A foto foi excluída; o envio foi cancelado.');
        }
        current = { ...current, syncStatus: 'pending', syncError: error instanceof Error ? error.message : 'Envio pendente.' };
      }
      const durable = saveCache();
      if (durable && current.syncStatus === 'synced' && localKey) {
        try { await deleteLocalFile(localKey, actor); current = { ...current, localFileKey: undefined }; saveCache(); }
        catch { /* The durable localFileKey keeps cleanup eligible for retry. */ }
      }
      return current.photoURL;
    })();
    photoWrites.set(key, operation);
    try { return await operation; } finally { if (photoWrites.get(key) === operation) photoWrites.delete(key); }
  },

  deletePhoto: async (photoId: string): Promise<void> => {
    const actor = requireActor(), cache = cacheForUser(actor);
    const photo = cache.readJson<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, []).find(item => item.id === photoId);
    const existing = photoDeletions(actor).find(item => item.id === photoId);
    if (!photo && !existing) throw new Error('Atualize a lista antes de excluir esta foto.');
    const deletion: PhotoDeletion = existing ?? { id: photoId, studentId: photo!.studentId, reference: photo!.photoURL, localFileKey: photo!.localFileKey, pending: true };
    deletion.pending = true;
    cache.setItem(PHOTO_DELETIONS, JSON.stringify([deletion, ...photoDeletions(actor).filter(item => item.id !== photoId)]));
    const { data, error } = await supabase.rpc('delete_evolution_photo', { p_photo_id: photoId, p_student_id: deletion.studentId });
    if (error) throw mutationError(error);
    const running = photoWrites.get(actor + ':' + photoId);
    if (running) await running.catch(() => {});
    assertActor(actor);
    const references = new Set<string>([deletion.reference ?? '', ...(Array.isArray(data) ? data : []),
      ...['jpg','png','webp'].map(extension => toStorageReference('evolution-photos', deletion.studentId + '/' + photoId + '.' + extension))]);
    for (const ref of references) if (ref.startsWith('storage://')) {
      await removeUnusedMedia(ref, actor);
    }
    if (deletion.localFileKey) await deleteLocalFile(deletion.localFileKey, actor);
    if (deletion.reference?.startsWith('idb:')) await deleteLocalFile(deletion.reference, actor);
    persistOutbox(cache, CACHE_KEYS.PHOTOS, cache.readJson<EvolutionPhoto[]>(CACHE_KEYS.PHOTOS, []).filter(p => p.id !== photoId));
    cache.setItem(PHOTO_DELETIONS, JSON.stringify(photoDeletions(actor).map(item => item.id === photoId ? { ...item, pending: false } : item)));
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
    const actor = requireActor();
    const rows = await prescriptionRows('routine');
    assertActor(actor);
    const routines = rows.map(row => rowToAdminRoutine(row, (row.exercises ?? []).map(rowToAdminExercise)));
    cacheForUser(actor).setRemoteItem('cadu_ponce_admin_routines', JSON.stringify(routines));
    return routines;
  },

  getAdminRoutines: (): AdminRoutine[] => cacheStorage.readJson<AdminRoutine[]>('cadu_ponce_admin_routines', []),

  saveAdminRoutine: async (routine: AdminRoutine): Promise<void> => {
    const actor = requireActor(), cache = cacheForUser(actor);
    const payload = { id: routine.id, name: routine.name, goal: routine.goal ?? '', difficulty: routine.difficulty ?? '',
      day_of_week: routine.dayOfWeek ?? null, muscle_group: routine.muscleGroup ?? null,
      general_notes: routine.generalNotes ?? null, notes: routine.notes ?? null,
      student_ids: [...new Set(routine.studentIds ?? [])], student_names: routine.studentNames ?? [],
      start_date: routine.startDate ?? null, end_date: routine.endDate ?? null, routine_group_name: routine.routineGroupName ?? null,
      settings: prescriptionSettings(routine),
      exercises: routine.exercises.map(ex => exercisePayload({ ...ex, id: routine.version ? ex.id : crypto.randomUUID() })) };
    const { data, error } = await supabase.rpc('save_admin_routine', { p_payload: payload, p_expected_version: routine.version ?? null });
    if (error) throw mutationError(error);
    if (!data?.id || !data.version) throw new Error('Não foi possível confirmar a gravação completa da rotina. Recarregue antes de tentar novamente.');
    const saved = rowToAdminRoutine(data, (data.exercises ?? []).map(rowToAdminExercise));
    Object.assign(routine, saved);
    const all = cache.readJson<AdminRoutine[]>('cadu_ponce_admin_routines', []);
    cache.setRemoteItem('cadu_ponce_admin_routines', JSON.stringify([saved, ...all.filter(r => r.id !== saved.id)]));
    assertActor(actor);
  },

  assignRoutineToStudent: async (routineId: string, studentId: string): Promise<Workout> => {
    const actor = requireActor();
    const { data, error } = await supabase.rpc('assign_routine_to_student', { p_routine_id: routineId, p_student_id: studentId, p_remove: false });
    if (error) throw mutationError(error);
    if (!data?.id) throw new Error('A atribuição não foi confirmada. Recarregue a lista.');
    assertActor(actor);
    return rowToWorkout(data);
  },
  unassignRoutineFromStudent: async (routineId: string, studentId: string): Promise<void> => {
    const actor = requireActor();
    const { error } = await supabase.rpc('assign_routine_to_student', { p_routine_id: routineId, p_student_id: studentId, p_remove: true });
    if (error) throw mutationError(error);
    assertActor(actor);
    const cache = cacheForUser(actor);
    cache.setRemoteItem(CACHE_KEYS.WORKOUTS, JSON.stringify(cache.readJson<Workout[]>(CACHE_KEYS.WORKOUTS, []).filter(w => !(w.routineId === routineId && w.studentId === studentId))));
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

  fetchAgendaEvents: async (options: { allowCached?: boolean } = {}): Promise<any[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    let data: any[] | null = null, error: unknown;
    try { data = await readAllRows(() => supabase.from('agenda_events').select('*').neq('type', 'media_storage').order('id')); }
    catch (failure) { error = failure; }
      
    if (error || !data) {
      if (!options.allowCached) throw error ?? new Error('Não foi possível atualizar a agenda.');
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
    const data = await readAllRows(() => supabase.from('custom_exercises').select('*').order('created_at', { ascending: false }).order('id'));
    const local = readLibraryCache(cache);
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
    const data = await readAllRows(() => supabase.from('muscle_groups').select('id,name').order('id'));
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
    const data = await readAllRows(() => supabase.from('exercise_categories').select('id,name').order('id'));
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
    for (const deletion of photoDeletions(userId).filter(item => item.pending)) {
      if (userId !== getCacheUser()) return;
      try { await storage.deletePhoto(deletion.id); } catch { /* The durable deletion remains queued. */ }
    }
    const mediaCache = cacheForUser(userId);
    for (const item of mediaCache.readJson<{id:string;reference:string}[]>('cadu_media_cleanup', [])) {
      if (userId !== getCacheUser()) return;
      try {
        const { error } = await supabase.from('agenda_events').delete().eq('id', item.id).eq('type', 'student_file');
        if (error) throw error;
        await removeUnusedMedia(item.reference, userId);
        mediaCache.setItem('cadu_media_cleanup', JSON.stringify(mediaCache.readJson<{id:string;reference:string}[]>('cadu_media_cleanup', []).filter(entry => entry.id !== item.id)));
      } catch { /* Keep failed cleanup durable for the next authenticated retry. */ }
    }
    const profile = storage.getUser();
    const canSync = (studentId: string) => studentId === userId || profile?.role === 'admin';
    for (const log of storage.getWorkoutLogs().filter(log => log.syncStatus === 'pending' && canSync(log.studentId))) {
      if (userId !== getCacheUser()) return;
      await storage.saveWorkoutLog(log);
    }
    for (const photo of storage.getPhotos().filter(photo => (photo.syncStatus === 'pending' || photo.localFileKey || photo.photoURL.startsWith('idb:')) && canSync(photo.studentId))) {
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

  fetchStudentAgenda: async (studentId: string): Promise<AgendaEvent[]> => {
    const events = await storage.fetchAgendaEvents({ allowCached: false });
    return events.filter(event => event.studentId === studentId && ['presential','online','other'].includes(event.type));
  },

  fetchAssessments: async (studentId: string): Promise<Assessment[]> => {
    const rows = await readAllRows(() => supabase.from('assessments').select('*').eq('student_id', studentId).order('date', { ascending: false }).order('id'));
    return rows.map(row => ({ id: row.id, studentId: row.student_id, date: row.date, weight: row.weight ?? undefined,
      height: row.height ?? undefined, bodyFat: row.body_fat ?? undefined, measurements: row.measurements ?? {}, notes: row.notes ?? undefined, createdAt: row.created_at }));
  },
  saveAssessment: async (record: Assessment): Promise<void> => {
    requireActor();
    for (const value of [record.weight,record.height,record.bodyFat,...Object.values(record.measurements ?? {})])
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('Informe medidas válidas.');
    const { data, error } = await supabase.from('assessments').upsert({ id: record.id, student_id: record.studentId, date: record.date,
      weight: record.weight ?? null, height: record.height ?? null, body_fat: record.bodyFat ?? null, measurements: record.measurements ?? {}, notes: record.notes ?? null }).select('id').single();
    if (error || data?.id !== record.id) throw error ?? new Error('A avaliação não foi confirmada.');
  },
  deleteAssessment: async (id: string): Promise<void> => {
    const { data, error } = await supabase.from('assessments').delete().eq('id', id).select('id').single();
    if (error || !data?.id) throw error ?? new Error('Avaliação não encontrada.');
  },
  fetchAnamneses: async (studentId: string): Promise<Anamnesis[]> => {
    const rows = await readAllRows(() => supabase.from('anamnesis').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).order('id'));
    return rows.map(row => ({ id: row.id, studentId: row.student_id, title: row.responses?.title ?? 'Anamnese',
      questions: Array.isArray(row.responses?.questions) ? row.responses.questions : [], status: row.responses?.status === 'answered' ? 'answered' : 'pending',
      version: Number(row.version), createdAt: row.created_at, updatedAt: row.updated_at }));
  },
  saveAnamnesis: async (record: Anamnesis): Promise<Anamnesis> => {
    requireActor();
    const { data, error } = await supabase.rpc('save_anamnesis', { p_payload: { id: record.id, student_id: record.studentId,
      responses: { title: record.title, questions: record.questions, status: record.status } }, p_expected_version: record.version ?? null });
    if (error) throw mutationError(error);
    if (!data?.id) throw new Error('O formulário não foi confirmado.');
    return { ...record, version: Number(data.version), createdAt: data.created_at, updatedAt: data.updated_at };
  },
  deleteAnamnesis: async (id: string): Promise<void> => {
    const { data, error } = await supabase.from('anamnesis').delete().eq('id', id).select('id').single();
    if (error || !data?.id) throw error ?? new Error('Formulário não encontrado.');
  },
  fetchStudentFiles: async (studentId: string): Promise<StudentFile[]> => {
    const rows = await readAllRows(() => supabase.from('agenda_events').select('*').eq('type','student_file').eq('student_id', studentId).order('created_at', { ascending: false }).order('id'));
    return rows.flatMap(row => { try { const notes = JSON.parse(row.notes ?? '{}');
      if (!notes.filePath) return [];
      return [{ id: row.id, studentId: row.student_id, name: notes.fileName ?? row.title, storagePath: notes.filePath.startsWith('storage://') ? notes.filePath : toStorageReference('arquivos-alunos',notes.filePath),
        mimeType: notes.fileType ?? '', size: Number(notes.fileSize) || 0, category: notes.category, createdAt: row.created_at }];
    } catch { return []; } });
  },
  uploadStudentFile: async (studentId: string, file: File, category?: string): Promise<StudentFile> => {
    const actor = requireActor();
    const allowed = ['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/msword','application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','video/mp4','video/quicktime'];
    if (!allowed.includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) throw new Error('Use um formato permitido de até 20 MB.');
    const id = crypto.randomUUID(), path = studentId + '/' + id + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
    const { error: uploadError } = await supabase.storage.from('arquivos-alunos').upload(path,file,{ upsert: false,contentType:file.type });
    if (uploadError) throw uploadError;
    assertActor(actor);
    const result: StudentFile = { id,studentId,name:file.name,storagePath:toStorageReference('arquivos-alunos',path),mimeType:file.type,size:file.size,category,createdAt:new Date().toISOString() };
    const { data,error } = await supabase.from('agenda_events').insert({ id,student_id:studentId,title:'Arquivo enviado: '+file.name,
      date:result.createdAt.slice(0,10),start_time:'00:00',end_time:'00:00',type:'student_file',
      notes:JSON.stringify({fileName:file.name,filePath:path,fileType:file.type,fileSize:file.size,category}),created_at:result.createdAt }).select('id').single();
    if (error || !data?.id) {
      await removeUnusedMedia(result.storagePath,actor).catch(() => {});
      throw error ?? new Error('O envio do arquivo não foi confirmado.');
    }
    return result;
  },
  saveStudentFile: (studentId: string,file: File,category?: string): Promise<StudentFile> => storage.uploadStudentFile(studentId,file,category),
  deleteStudentFile: async (id: string): Promise<void> => {
    const actor=requireActor();
    const { data:row,error:readError }=await supabase.from('agenda_events').select('*').eq('id',id).eq('type','student_file').single();
    if (readError || !row) throw readError ?? new Error('Arquivo não encontrado.');
    const notes=JSON.parse(row.notes ?? '{}');
    const reference=notes.filePath?.startsWith('storage://')?notes.filePath:toStorageReference('arquivos-alunos',notes.filePath);
    const cache=cacheForUser(actor), key='cadu_media_cleanup';
    const pending=cache.readJson<{id:string;reference:string}[]>(key,[]);
    cache.setItem(key,JSON.stringify([{id,reference},...pending.filter(item=>item.id!==id)]));
    const {data,error}=await supabase.from('agenda_events').delete().eq('id',id).eq('type','student_file').select('id').single();
    if(error || !data?.id) throw error ?? new Error('A remoção não foi confirmada.');
    await removeUnusedMedia(reference,actor);
    cache.setItem(key,JSON.stringify(cache.readJson<{id:string;reference:string}[]>(key,[]).filter(item=>item.id!==id)));
  },
  uploadProfilePhoto: async (studentId: string,file: File): Promise<string> => {
    const actor=requireActor();
    if(!file.type.startsWith('image/') || !file.size || file.size>20*1024*1024) throw new Error('Selecione uma imagem de até 20 MB.');
    const blob=await compressImage(file,800,0.85);assertActor(actor);
    const path=studentId+'/avatar-'+crypto.randomUUID()+'.jpg';
    const {error}=await supabase.storage.from('evolution-photos').upload(path,blob,{contentType:blob.type,upsert:false});
    if(error)throw error;assertActor(actor);return toStorageReference('evolution-photos',path);
  },
  fetchWorkoutFeedbacks: async (studentId?: string): Promise<WorkoutFeedback[]> => {
    const rows=await readAllRows(()=>{let q=supabase.from('agenda_events').select('*').eq('type','workout_feedback').order('created_at',{ascending:false}).order('id');return studentId?q.eq('student_id',studentId):q;});
    const feedback:WorkoutFeedback[]=rows.flatMap(row=>{try{const n=JSON.parse(row.notes??'{}');return [{id:row.id,studentId:row.student_id,routineId:n.routineId,routineName:n.routineName??'Treino',rating:Number(n.rating)||0,comment:n.comment??'',createdAt:row.created_at,updatedAt:n.updatedAt,source:'feedback' as const}];}catch{return [];}});
    const logs=await queryWorkoutLogs(studentId);
    return [...feedback,...logs.filter(log=>log.comment||log.rpe).map(log=>({id:log.id,logId:log.id,studentId:log.studentId,routineId:log.routineId,routineName:log.routineName,
      rating:Math.max(0,Math.min(5,(log.rpe??0)/2)),comment:log.comment??'',createdAt:log.completedAt,source:'completion' as const}))].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  },
  saveWorkoutFeedback: async (record: WorkoutFeedback): Promise<WorkoutFeedback> => {
    requireActor();
    if(!Number.isFinite(record.rating)||record.rating<1||record.rating>5||record.comment.length>5000) throw new Error('Informe uma nota de 1 a 5 e comentário de até 5000 caracteres.');
    const saved={...record,updatedAt:new Date().toISOString()};
    if(record.source==='completion'&&record.logId){
      const {data,error}=await supabase.from('workout_logs').update({rpe:record.rating*2,comment:record.comment}).eq('id',record.logId).eq('student_id',record.studentId).select('id').single();
      if(error||!data?.id)throw error??new Error('Feedback não confirmado.');
    }else{
      const {data,error}=await supabase.from('agenda_events').upsert({id:record.id,student_id:record.studentId,title:'Feedback de treino',date:record.createdAt.slice(0,10),start_time:'00:00',end_time:'00:00',type:'workout_feedback',notes:JSON.stringify(saved),created_at:record.createdAt}).select('id').single();
      if(error||!data?.id)throw error??new Error('Feedback não confirmado.');
    }
    return saved;
  },
  deleteWorkoutFeedback: async (id: string): Promise<void> => {
    const {data,error}=await supabase.from('agenda_events').delete().eq('id',id).eq('type','workout_feedback').select('id').single();
    if(error||!data?.id)throw error??new Error('Feedback não encontrado. O registro de conclusão do treino é preservado.');
  },
  fetchStudentNotifications: async (studentId: string): Promise<StudentNotification[]> => {
    const rows=await readAllRows(()=>supabase.from('student_notifications').select('*').eq('recipient_id',studentId).order('created_at',{ascending:false}).order('id'));
    return rows.map(row=>({id:row.id,recipientId:row.recipient_id,title:row.title,body:row.body,type:row.type,createdAt:row.created_at,readAt:row.read_at??undefined}));
  },
  markStudentNotificationRead: async (id: string): Promise<void> => {
    const actor=requireActor();
    const {data,error}=await supabase.from('student_notifications').update({read_at:new Date().toISOString()}).eq('id',id).eq('recipient_id',actor).select('id').single();
    if(error||!data?.id)throw error??new Error('A leitura da notificação não foi confirmada.');
  },

  // ── Financial / Pendências & Faturas 100% Manuais e Editáveis ───────────────

  /** Busca todas as faturas e pendências financeiras registradas no Supabase */
  fetchFinancialInvoices: async (): Promise<FinancialInvoice[]> => {
    const cache=cacheForUser(getCacheUser());
    const data=await readAllRows(()=>supabase.from('agenda_events').select('*').eq('type','financial_invoice').order('date').order('id'));
    const invoices:FinancialInvoice[]=data.map(row=>{let extra:any={};try{extra=JSON.parse(row.notes??'{}');}catch{}
      return {id:row.id,studentId:row.student_id??extra.studentId,studentName:row.student_name||extra.studentName||'Aluno',studentPhone:extra.studentPhone||'',
        amount:Number(row.start_time)||Number(extra.amount)||0,dueDate:row.date,paymentMethod:row.end_time||extra.paymentMethod||'PIX',status:extra.status==='paid'?'paid':'pending',
        description:row.title||extra.description||'Mensalidade',paidAt:extra.paidAt,createdAt:row.created_at};});
    cache.setRemoteItem('cadu_financial_invoices',JSON.stringify(invoices));return invoices;
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
