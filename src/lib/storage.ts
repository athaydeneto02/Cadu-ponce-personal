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
import { storeLocalFile, compressImage, resolveMediaUrl, getLocalBlob, toStorageReference, clearMediaCache } from './mediaDb';
import { sessionCache as cacheStorage, cacheForUser, getCacheUser, setCacheUser, readCached } from './sessionCache';

// ---------------------------------------------------------------------------
// Safe localStorage helper - prevents QuotaExceededError crashes (white screen)
// ---------------------------------------------------------------------------
export function safeSetItem(key: string, value: string, cache = cacheStorage): boolean {
  try {
    cache.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[storage] Quota exceeded on cacheStorage.setItem(${key}):`, err);
    try {
      if (key === 'cadu_ponce_exercises_v3') {
        const parsed = JSON.parse(value);
        const cleaned = parsed.map((ex: any) => ({
          ...ex,
          image: ex.image && ex.image.length > 30000 ? 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&q=80&w=200' : ex.image,
          videoUrl: ex.videoUrl && ex.videoUrl.length > 30000 ? '' : ex.videoUrl,
        }));
        cache.setItem(key, JSON.stringify(cleaned));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }
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
    cacheStorage.setItem(CACHE_KEYS.USER, JSON.stringify(safeUser));
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
      const cached = cacheStorage.getItem('cadu_ponce_all_users');
      return cached ? JSON.parse(cached) : [];
    }
    const users = data.map(rowToUserProfile);
    cacheStorage.setItem('cadu_ponce_all_users', JSON.stringify(users));
    return users;
  },

  /** Returns cached users list (sync). */
  getUsersList: (): UserProfile[] => {
    const data = cacheStorage.getItem('cadu_ponce_all_users');
    return data ? JSON.parse(data) : [];
  },

  /** Saves users list to local cache. */
  saveUsersList: (users: UserProfile[]): void => {
    cacheStorage.setItem('cadu_ponce_all_users', JSON.stringify(users));
  },

  /** Updates a user profile in Supabase. */
  updateProfile: async (user: UserProfile): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase
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
      .eq('id', user.uid);

    if (error) throw error;
    if (user.uid === getCacheUser()) storage.saveUser(user);
  },

  /** Deletes a profile from Supabase. */
  deleteProfile: async (userId: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) throw error;
    const users = storage.getUsersList().filter(u => u.uid !== userId);
    storage.saveUsersList(users);
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
    const cached: Workout[] = JSON.parse(cache.getItem(CACHE_KEYS.WORKOUTS) ?? '[]');
    if (error || !data) return cached.filter(w => !studentId || w.studentId === studentId);
    const ids = data.map(row => row.id);
    const exercises = ids.length
      ? await supabase.from('exercises').select('*').in('workout_id', ids).order('sort_order', { ascending: true })
      : { data: [], error: null };
    if (exercises.error) throw exercises.error;
    const workouts = data.map(row => rowToWorkout({ ...row, exercises: (exercises.data ?? []).filter(exercise => exercise.workout_id === row.id) }));
    const others = studentId ? cached.filter(w => w.studentId !== studentId) : [];
    cache.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify([...others, ...workouts]));
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
    const all: Workout[] = JSON.parse(cache.getItem(CACHE_KEYS.WORKOUTS) ?? '[]');
    cache.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify([workout, ...all.filter(w => w.id !== workout.id)]));
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
    const all: Workout[] = JSON.parse(cache.getItem(CACHE_KEYS.WORKOUTS) ?? '[]');
    cache.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(all.filter(w => w.id !== workoutId || (studentId && w.studentId !== studentId))));
  },

  // ── Progress ──────────────────────────────────────────────────────────────

  getProgress: (): ProgressEntry[] => {
    const data = cacheStorage.getItem(CACHE_KEYS.PROGRESS);
    return data ? JSON.parse(data) : [];
  },

  fetchProgress: async (studentId: string): Promise<ProgressEntry[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('progress_entries')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: false });

    if (error || !data) return storage.getProgress();

    const entries: ProgressEntry[] = data.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      exerciseName: row.exercise_name,
      load: row.load,
      reps: row.reps,
      notes: row.notes ?? undefined,
      date: row.date,
    }));

    cacheStorage.setItem(CACHE_KEYS.PROGRESS, JSON.stringify(entries));
    return entries;
  },

  saveProgress: async (entry: ProgressEntry): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('progress_entries').insert({
      id: entry.id,
      student_id: entry.studentId,
      exercise_name: entry.exerciseName,
      load: entry.load,
      reps: entry.reps,
      notes: entry.notes ?? null,
      date: entry.date,
    });
    if (error) throw error;
    const all = storage.getProgress();
    cacheStorage.setItem(CACHE_KEYS.PROGRESS, JSON.stringify([entry, ...all]));
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
    cache.setItem(CACHE_KEYS.PHOTOS, JSON.stringify([...latest.filter(photo => photo.studentId !== studentId), ...merged]));
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
      cache.setItem(CACHE_KEYS.PHOTOS, JSON.stringify([current, ...all.filter(p => p.id !== photo.id)]));
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
    const all: EvolutionPhoto[] = JSON.parse(cacheStorage.getItem(CACHE_KEYS.PHOTOS) ?? '[]');
    cacheStorage.setItem(CACHE_KEYS.PHOTOS, JSON.stringify(all.filter(p => p.id !== photoId)));
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

    if (rErr || !safeRoutineRows) {
      console.warn('fetchAdminRoutines fallback for admin_routines table:', rErr?.message);
      safeRoutineRows = []; // Proceed with empty array so agenda_events can still be parsed!
    }

    // Fetch exercises for all routines in parallel with the agenda query (already done above)
    const routineIds = safeRoutineRows.map(r => r.id as string);
    const exercisesByRoutine: Record<string, AdminExercise[]> = {};

    if (routineIds.length > 0) {
      const { data: exRows } = await supabase
        .from('admin_exercises')
        .select('*')
        .in('routine_id', routineIds)
        .order('sort_order', { ascending: true });

      if (exRows) {
        exRows.forEach(row => {
          const rid = row.routine_id as string;
          if (!exercisesByRoutine[rid]) exercisesByRoutine[rid] = [];
          exercisesByRoutine[rid].push(rowToAdminExercise(row));
        });
      }
    }

    // Merge Supabase data with local cache:
    const localCached: AdminRoutine[] = JSON.parse(cacheStorage.getItem('cadu_ponce_admin_routines') ?? '[]');
    const deletedList: string[] = JSON.parse(cacheStorage.getItem('cadu_ponce_deleted_routines') ?? '[]');
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
        cacheStorage.setItem('cadu_ponce_deleted_routines', JSON.stringify(Array.from(deletedSet)));

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
    cacheStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(finalRoutines));

    const cleanWorkouts = storage.getWorkouts().filter(w => !isDeleted(w.id));
    cacheStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(cleanWorkouts));

    return finalRoutines;
  },


  /** Returns cached routines (sync, used while async fetch is in-flight). */
  getAdminRoutines: (): AdminRoutine[] => {
    const data = cacheStorage.getItem('cadu_ponce_admin_routines');
    return data ? JSON.parse(data) : [];
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
    const all: AdminRoutine[] = JSON.parse(cache.getItem('cadu_ponce_admin_routines') ?? '[]');
    cache.setItem('cadu_ponce_admin_routines', JSON.stringify([routine, ...all.filter(r => r.id !== routine.id)]));
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
    const routines: AdminRoutine[] = JSON.parse(cache.getItem('cadu_ponce_admin_routines') ?? '[]');
    cache.setItem('cadu_ponce_admin_routines', JSON.stringify(routines.filter(r => r.id !== id)));
    const workouts: Workout[] = JSON.parse(cache.getItem(CACHE_KEYS.WORKOUTS) ?? '[]');
    cache.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(workouts.filter(w => w.routineId !== id)));
  },

  fetchAgendaEvents: async (): Promise<any[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('agenda_events')
      .select('*');
      
    if (error || !data) {
      const cached = cacheStorage.getItem('cp_agenda_events');
      return cached ? JSON.parse(cached) : [];
    }
    
    const events = data.map(row => ({
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
    
    cacheStorage.setItem('cp_agenda_events', JSON.stringify(events));
    return events;
  },

  getAgendaEvents: (): any[] => {
    const data = cacheStorage.getItem('cp_agenda_events');
    return data ? JSON.parse(data) : [];
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
    
    if (error) console.error('saveAgendaEvent error:', error.message);

    // Update local cache
    const events = storage.getAgendaEvents();
    const existingIdx = events.findIndex((e: any) => e.id === event.id);
    if (existingIdx >= 0) {
      events[existingIdx] = event;
    } else {
      events.push(event);
    }
    cacheStorage.setItem('cp_agenda_events', JSON.stringify(events));
  },

  deleteAgendaEvent: async (id: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { error } = await supabase.from('agenda_events').delete().eq('id', id);
    if (error) console.error('deleteAgendaEvent error:', error.message);
    
    const events = storage.getAgendaEvents();
    const newEvents = events.filter((e: any) => e.id !== id);
    cacheStorage.setItem('cp_agenda_events', JSON.stringify(newEvents));
  },

  // ── Custom Exercises (Biblioteca de Exercícios) ───────────────────────────

  /** Fetches custom exercises from Supabase. */
  fetchCustomExercises: async (): Promise<any[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('custom_exercises')
      .select('*')
      .order('created_at', { ascending: false });

    const cached = cacheStorage.getItem('cadu_ponce_exercises_v3');
    const localExercises: any[] = cached ? JSON.parse(cached) : [];

    if (error || !data || data.length === 0) {
      if (error) console.warn('fetchCustomExercises error:', error.message);
      // If DB is empty or fails, return local cache (do NOT overwrite it with [])
      return localExercises;
    }

    const dbExercises = data.map(row => ({
      id: row.id,
      title: row.title,
      group: row.group,
      category: row.category,
      videoUrl: row.video_url ?? undefined,
      videoFileUrl: row.video_file_url ?? undefined,
      isCustom: true,
      image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&q=80&w=200',
      description: 'Exercício personalizado adicionado pelo treinador.',
    }));

    // Merge DB exercises with local exercises
    const dbIds = new Set(dbExercises.map(e => e.id));
    const unsyncedLocals = localExercises.filter(e => !dbIds.has(e.id));
    const merged = [...dbExercises, ...unsyncedLocals];

    safeSetItem('cadu_ponce_exercises_v3', JSON.stringify(merged), cacheStorage);
    return merged;
  },

  /** Upserts a custom exercise to Supabase and updates local cache safely. */
  saveCustomExercise: async (exercise: any): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    // Upsert to Supabase
    try {
      const { error } = await supabase.from('custom_exercises').upsert({
        id: exercise.id,
        title: exercise.title,
        group: exercise.group,
        category: exercise.category,
        video_url: exercise.videoUrl ?? null,
        video_file_url: exercise.videoFileUrl ?? null,
      });
      if (error) console.error('saveCustomExercise error:', error.message);
    } catch (err) {
      console.warn('saveCustomExercise cloud error:', err);
    }

    // Always update local cache safely
    try {
      const cached = cacheStorage.getItem('cadu_ponce_exercises_v3');
      const all: any[] = cached ? JSON.parse(cached) : [];
      const idx = all.findIndex((e: any) => e.id === exercise.id);
      if (idx >= 0) all[idx] = exercise; else all.unshift(exercise);
      safeSetItem('cadu_ponce_exercises_v3', JSON.stringify(all), cacheStorage);
    } catch (err) {
      console.warn('saveCustomExercise local cache error:', err);
    }
  },

  /** Deletes a custom exercise from Supabase. */
  deleteCustomExercise: async (id: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    try {
      const { error } = await supabase.from('custom_exercises').delete().eq('id', id);
      if (error) console.error('deleteCustomExercise error:', error.message);
    } catch (err) {
      console.warn('deleteCustomExercise error:', err);
    }
    const cached = cacheStorage.getItem('cadu_ponce_exercises_v3');
    const all: any[] = cached ? JSON.parse(cached) : [];
    safeSetItem('cadu_ponce_exercises_v3', JSON.stringify(all.filter((e: any) => e.id !== id)), cacheStorage);
  },

  // ── Muscle Groups & Categories ────────────────────────────────────────────

  fetchMuscleGroups: async (): Promise<string[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('muscle_groups')
      .select('name')
      .order('id', { ascending: true });

    if (error || !data || data.length === 0) return storage.getMuscleGroups();
    const groups = data.map(r => r.name as string);
    cacheStorage.setItem('cadu_ponce_muscle_groups', JSON.stringify(groups));
    return groups;
  },

  getMuscleGroups: (): string[] => {
    const data = cacheStorage.getItem('cadu_ponce_muscle_groups');
    return data ? JSON.parse(data) : ['Abdômen', 'Pernas', 'Peito', 'Ombros', 'Costas', 'Braços', 'Cardio', 'Core'];
  },

  saveMuscleGroups: async (groups: string[]): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    cacheStorage.setItem('cadu_ponce_muscle_groups', JSON.stringify(groups));
    await supabase.from('muscle_groups').delete().neq('id', 0);
    if (groups.length > 0) await supabase.from('muscle_groups').insert(groups.map(name => ({ name })));
  },

  fetchCategories: async (): Promise<string[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const { data, error } = await supabase
      .from('exercise_categories')
      .select('name')
      .order('id', { ascending: true });

    if (error || !data || data.length === 0) return storage.getCategories();
    const cats = data.map(r => r.name as string);
    cacheStorage.setItem('cadu_ponce_categories', JSON.stringify(cats));
    return cats;
  },

  getCategories: (): string[] => {
    const data = cacheStorage.getItem('cadu_ponce_categories');
    return data ? JSON.parse(data) : ['Musculação', 'Funcional', 'Alongamento'];
  },

  saveCategories: async (categories: string[]): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    cacheStorage.setItem('cadu_ponce_categories', JSON.stringify(categories));
    await supabase.from('exercise_categories').delete().neq('id', 0);
    if (categories.length > 0) await supabase.from('exercise_categories').insert(categories.map(name => ({ name })));
  },

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

  // ── Workout Logs ──────────────────────────────────────────────────────────
  // Stores completed session history for each student.

  WORKOUT_LOGS_KEY: 'cadu_workout_logs',

  /** Keep an outbox until the database confirms the write. */
  saveWorkoutLog: async (log: WorkoutLog): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const actor = getCacheUser();
    if (!actor) throw new Error('Entre na sua conta para registrar o treino.');
    const cache = cacheForUser(actor);
    let entry: WorkoutLog = { ...log, syncStatus: 'pending', syncError: undefined };
    const saveCache = () => {
      const all = readCached<WorkoutLog[]>('cadu_workout_logs', [], actor);
      cache.setItem('cadu_workout_logs', JSON.stringify([entry, ...all.filter(item => item.id !== entry.id)]));
    };
    saveCache();
    try {
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
  },

  getWorkoutLogs: (): WorkoutLog[] => readCached<WorkoutLog[]>('cadu_workout_logs', []),

  fetchWorkoutLogs: async (studentId: string): Promise<WorkoutLog[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const actor = getCacheUser();
    const cache = cacheForUser(actor);
    const cached = readCached<WorkoutLog[]>('cadu_workout_logs', [], actor);
    const { data, error } = await supabase.from('workout_logs').select('*').eq('student_id', studentId).order('completed_at', { ascending: false }).limit(100);
    if (error || !data) return cached.filter(log => log.studentId === studentId);
    const logs: WorkoutLog[] = data.map(row => ({
      id: row.id, studentId: row.student_id, studentName: row.student_name ?? undefined,
      routineId: row.routine_id, routineName: row.routine_name, completedAt: row.completed_at,
      durationSeconds: row.duration_seconds, rpe: row.rpe, exercisesSummary: row.exercises_summary ?? [],
      comment: row.comment ?? undefined, syncStatus: 'synced',
    }));
    const latest = readCached<WorkoutLog[]>('cadu_workout_logs', [], actor);
    const pending = latest.filter(log => log.studentId === studentId && log.syncStatus === 'pending');
    const pendingIds = new Set(pending.map(log => log.id));
    const merged = [...pending, ...logs.filter(log => !pendingIds.has(log.id))];
    cache.setItem('cadu_workout_logs', JSON.stringify([...latest.filter(log => log.studentId !== studentId), ...merged]));
    return merged;
  },

  syncPendingData: async (userId: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    if (userId !== getCacheUser()) return;
    const profile = storage.getUser();
    const canSync = (studentId: string) => studentId === userId || profile?.role === 'admin';
    for (const log of storage.getWorkoutLogs().filter(log => log.syncStatus === 'pending' && canSync(log.studentId))) {
      if (userId !== getCacheUser()) return;
      await storage.saveWorkoutLog(log);
      if (storage.getWorkoutLogs().find(item => item.id === log.id)?.syncStatus === 'synced') {
        await storage.notifyTrainerWorkoutCompleted({
          logId: log.id, studentId: log.studentId, studentName: log.studentName || 'Aluno',
          routineName: log.routineName, durationSeconds: log.durationSeconds,
          durationFormatted: `${Math.floor(log.durationSeconds / 60)} min`,
        });
      }
    }
    for (const photo of storage.getPhotos().filter(photo => (photo.syncStatus === 'pending' || photo.photoURL.startsWith('idb:')) && canSync(photo.studentId))) {
      if (userId !== getCacheUser()) return;
      try { await storage.savePhoto(photo); } catch { /* keep file and pending record for recovery */ }
    }
    if (typeof window !== 'undefined' && userId === getCacheUser()) window.dispatchEvent(new Event('cadu_data_synced'));
  },

  /**
   * Envia uma notificação em tempo real para a nuvem do Supabase avisando que um aluno concluiu o treino.
   * O celular do personal recebe essa notificação instantaneamente!
   */
  notifyTrainerWorkoutCompleted: async (details: {
    studentName: string;
    studentId: string;
    studentPhone?: string;
    routineName: string;
    durationFormatted: string;
    durationSeconds: number;
    logId?: string;
  }): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Gera UUID v4 válido compatível com a coluna UUID NOT NULL do Supabase
    const notifUuid = details.logId || crypto.randomUUID();

    const notifPayload: Record<string, unknown> = {
      id: notifUuid,
      studentName: details.studentName,
      studentId: details.studentId,
      studentPhone: details.studentPhone || '',
      workoutTitle: details.routineName,
      duration: details.durationFormatted,
      durationSeconds: details.durationSeconds,
      timestamp: timeStr,
      fullDate: now.toISOString(),
      isRead: false,
      type: 'completion',
      detailMessage: `${details.studentName} finalizou "${details.routineName}" em ${details.durationFormatted}.`
    };

    // 1. Salva no Supabase agenda_events com UUID válido
    try {
      const { error } = await supabase.from('agenda_events').upsert({
        id: notifUuid,
        student_id: details.studentId,
        student_name: details.studentName,
        title: `${details.studentName} concluiu "${details.routineName}"`,
        date: dateStr,
        start_time: timeStr,
        end_time: timeStr,
        type: 'trainer_notification',
        notes: JSON.stringify(notifPayload)
      }, { onConflict: 'id', ignoreDuplicates: true });

      if (error) {
        console.warn('Erro ao salvar notificação do treino no Supabase:', error.message, error.code);
        return;
      }
    } catch (err) {
      console.warn('Erro ao salvar notificação do treino no Supabase:', err);
      return;
    }

    // 2. Salva no cache local para atualização imediata (mesmo aparelho)
    try {
      if (!notifPayload.id) notifPayload.id = `local_${Date.now()}`;
      const existing = JSON.parse(cacheStorage.getItem('cadu_notifs_admin') ?? '[]');
      cacheStorage.setItem('cadu_notifs_admin', JSON.stringify([notifPayload, ...existing.filter((item: any) => item.id !== notifUuid)]));
      window.dispatchEvent(new CustomEvent('cadu_new_notification', { detail: notifPayload }));
    } catch {}
  },

  /**
   * Busca todas as notificações de treinos concluídos pelos alunos diretamente do Supabase.
   */
  fetchTrainerNotifications: async (): Promise<any[]> => {
    const cacheStorage = cacheForUser(getCacheUser());
    // Limpa o cache antigo que pode ter dados falsos
    cacheStorage.removeItem('cadu_notifs_admin');

    try {
      const { data, error } = await supabase
        .from('agenda_events')
        .select('*')
        .eq('type', 'trainer_notification')
        .order('created_at', { ascending: false })
        .limit(40);

      // Se Supabase respondeu (com ou sem registros), usamos só ele — sem fallback
      if (!error) {
        if (!data || data.length === 0) return [];

        return data.map(row => {
          try {
            const n = JSON.parse(row.notes || '{}');
            return {
              id: row.id,
              studentName: row.student_name || n.studentName || 'Aluno',
              studentId: row.student_id || n.studentId || '',
              studentPhone: n.studentPhone || '',
              workoutTitle: n.workoutTitle || row.title,
              duration: n.duration || '',
              timestamp: n.timestamp || new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              fullDate: n.fullDate || row.created_at,
              isRead: n.isRead ?? false,
              type: 'completion',
              detailMessage: n.detailMessage || `${row.student_name} concluiu o treino!`
            };
          } catch {
            return {
              id: row.id,
              studentName: row.student_name || 'Aluno',
              workoutTitle: row.title,
              duration: '',
              timestamp: new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              isRead: false,
              type: 'completion',
              detailMessage: row.title
            };
          }
        });
      }

      console.warn('Supabase retornou erro ao buscar notificações:', error?.message);
      return [];
    } catch (err) {
      // Só chega aqui se não houver conexão com a internet
      console.warn('Sem conexão ao buscar notificações:', err);
      return [];
    }
  },

  /** Marca notificação como lida no Supabase */
  markTrainerNotificationRead: async (notifId: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    try {
      const { data } = await supabase.from('agenda_events').select('notes').eq('id', notifId).single();
      if (data?.notes) {
        const parsed = JSON.parse(data.notes);
        parsed.isRead = true;
        await supabase.from('agenda_events').update({ notes: JSON.stringify(parsed) }).eq('id', notifId);
      }
    } catch {}
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
        cacheStorage.setItem('cadu_financial_invoices', JSON.stringify(invoices));
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

    try {
      await supabase.from('agenda_events').upsert({
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
    } catch (e) {
      console.warn('Erro ao salvar fatura no Supabase:', e);
    }

    try {
      const cached: FinancialInvoice[] = JSON.parse(cacheStorage.getItem('cadu_financial_invoices') || '[]');
      const filtered = cached.filter(i => i.id !== invoice.id);
      cacheStorage.setItem('cadu_financial_invoices', JSON.stringify([...filtered, invoice]));
    } catch {}
  },

  /** Exclui uma fatura do Supabase e do cache */
  deleteFinancialInvoice: async (id: string): Promise<void> => {
    const cacheStorage = cacheForUser(getCacheUser());
    try {
      await supabase.from('agenda_events').delete().eq('id', id);
    } catch (e) {
      console.warn('Erro ao deletar fatura no Supabase:', e);
    }

    try {
      const cached: FinancialInvoice[] = JSON.parse(cacheStorage.getItem('cadu_financial_invoices') || '[]');
      cacheStorage.setItem('cadu_financial_invoices', JSON.stringify(cached.filter(i => i.id !== id)));
    } catch {}
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
        cacheStorage.setItem('cadu_trainer_payment_settings', JSON.stringify(parsed));
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
    try {
      await supabase.from('agenda_events').upsert({
        id: '00000000-0000-4000-8000-000000000002',
        title: 'Configurações de Pagamento',
        date: '2026-01-01',
        start_time: '00:00',
        end_time: '00:00',
        type: 'trainer_payment_settings',
        notes: JSON.stringify(settings),
      });
    } catch (e) {
      console.warn('Erro ao salvar formas de pagamento no Supabase:', e);
    }

    try {
      cacheStorage.setItem('cadu_trainer_payment_settings', JSON.stringify(settings));
    } catch {}
  },
};
