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
import { Workout, ProgressEntry, EvolutionPhoto, UserProfile, AdminRoutine, AdminExercise, WorkoutLog } from '../types';

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
    role: row.role as 'admin' | 'student',
    status: (row.status as UserProfile['status']) ?? 'active',
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
    }));

  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    studentId: row.student_id as string,
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

  /** Returns the cached user from localStorage (sync – used on first render). */
  getUser: (): UserProfile | null => {
    const data = localStorage.getItem(CACHE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  },

  /** Persists the active user to localStorage cache. */
  saveUser: (user: UserProfile) => {
    localStorage.setItem(CACHE_KEYS.USER, JSON.stringify(user));
  },

  /** Fetches the full profile from Supabase for the currently authenticated user. */
  fetchCurrentProfile: async (): Promise<UserProfile | null> => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (error || !data) return null;
    const profile = rowToUserProfile(data);
    storage.saveUser(profile);
    return profile;
  },

  /** Fetches all profiles from Supabase (admin use). */
  fetchUsersList: async (): Promise<UserProfile[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) {
      const cached = localStorage.getItem('cadu_ponce_all_users');
      return cached ? JSON.parse(cached) : [];
    }
    const users = data.map(rowToUserProfile);
    localStorage.setItem('cadu_ponce_all_users', JSON.stringify(users));
    return users;
  },

  /** Returns cached users list (sync). */
  getUsersList: (): UserProfile[] => {
    const data = localStorage.getItem('cadu_ponce_all_users');
    return data ? JSON.parse(data) : [];
  },

  /** Saves users list to local cache. */
  saveUsersList: (users: UserProfile[]): void => {
    localStorage.setItem('cadu_ponce_all_users', JSON.stringify(users));
  },

  /** Updates a user profile in Supabase. */
  updateProfile: async (user: UserProfile): Promise<void> => {
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
    storage.saveUser(user);
  },

  /** Deletes a profile from Supabase. */
  deleteProfile: async (userId: string): Promise<void> => {
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) throw error;
    const users = storage.getUsersList().filter(u => u.uid !== userId);
    storage.saveUsersList(users);
  },

  /** Creates a new student account via Supabase Auth. */
  createStudentAccount: async (
    email: string,
    password: string,
    name: string,
    extraData?: Partial<UserProfile>
  ): Promise<UserProfile> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: extraData?.role ?? 'student' },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Usuário não criado');

    if (extraData && Object.keys(extraData).length > 0) {
      await supabase.from('profiles').update({
        weight: extraData.weight ?? null,
        height: extraData.height ?? null,
        trainer_phone: extraData.trainerPhone ?? null,
        modality: extraData.modality ?? null,
        metadata: extraData.metadata ?? {},
      }).eq('id', data.user.id);
    }

    return storage.fetchProfile(data.user.id) as Promise<UserProfile>;
  },

  adminCreateUser: async (
    email: string,
    name: string,
    extraData?: Partial<UserProfile>
  ): Promise<UserProfile> => {
    // Create a temporary client that DOES NOT persist the session,
    // so the Admin doesn't get logged out when creating a student!
    const { createClient } = await import('@supabase/supabase-js');
    const tempClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const password = extraData?.password || '123456';
    const { data, error } = await tempClient.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: extraData?.role ?? 'student' },
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error('Usuário não criado. Verifique se o e-mail já existe.');

    // Wait a brief moment for the Supabase trigger to create the profile row
    await new Promise(r => setTimeout(r, 1000));

    // Update the newly created profile with the extra data
    if (extraData) {
      await supabase.from('profiles').update({
        weight: extraData.weight ?? null,
        height: extraData.height ?? null,
        trainer_phone: extraData.trainerPhone ?? null,
        modality: extraData.modality ?? null,
        status: extraData.status ?? 'active',
        metadata: extraData.metadata ?? {},
      }).eq('id', data.user.id);
    }

    return {
      uid: data.user.id,
      name,
      email,
      role: extraData?.role ?? 'student',
      status: extraData?.status ?? 'active',
      trainerPhone: extraData?.trainerPhone,
      modality: extraData?.modality,
      createdAt: new Date().toISOString(),
      metadata: extraData?.metadata ?? {}
    };
  },

  // ── Workouts ─────────────────────────────────────────────────────────────

  getWorkouts: (): Workout[] => {
    const data = localStorage.getItem(CACHE_KEYS.WORKOUTS);
    return data ? JSON.parse(data) : [];
  },

  fetchWorkouts: async (studentId?: string): Promise<Workout[]> => {
    let query = supabase
      .from('workouts')
      .select('*, exercises(*)')
      .order('created_at', { ascending: false });

    if (studentId) query = query.eq('student_id', studentId);

    const { data, error } = await query;
    const localCached = storage.getWorkouts();
    if (error || !data) return localCached;

    const deletedList: string[] = JSON.parse(localStorage.getItem('cadu_ponce_deleted_routines') ?? '[]');
    const deletedSet = new Set(deletedList.map(s => s.toLowerCase().trim()));
    const isDeleted = (id?: string, name?: string) => {
      if (id && deletedSet.has(id.toLowerCase().trim())) return true;
      if (name && deletedSet.has(name.toLowerCase().trim())) return true;
      return false;
    };

    const fromSupabase = data
      .map(rowToWorkout)
      .filter(w => !isDeleted(w.id, w.name));

    const validLocals = localCached.filter(w => !isDeleted(w.id, w.name));
    const supabaseIds = new Set(fromSupabase.map(w => w.id));
    const unsyncedLocals = validLocals.filter(w => !supabaseIds.has(w.id));
    const merged = [...fromSupabase, ...unsyncedLocals];
    localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(merged));
    return merged;
  },

  saveWorkout: async (workout: Workout): Promise<void> => {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workout.id);
    const validWorkoutId = isUUID ? workout.id : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : workout.id);
    workout.id = validWorkoutId;

    try {
      const { error: wError } = await supabase.from('workouts').upsert({
        id: validWorkoutId,
        name: workout.name,
        description: workout.description ?? null,
        student_id: workout.studentId,
      });
      if (wError) {
        console.warn('saveWorkout Supabase error:', wError.message);
        return;
      }

      await supabase.from('exercises').delete().eq('workout_id', validWorkoutId);

      if (workout.exercises && workout.exercises.length > 0) {
        const rows = workout.exercises.map((e, idx) => {
          const exIsUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id);
          const exUUID = exIsUUID ? e.id : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ex_${Date.now()}_${idx}`);
          return {
            id: exUUID,
            workout_id: validWorkoutId,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            rest: e.rest ?? '60s',
            notes: e.notes ?? null,
            current_load: e.currentLoad ?? 0,
            sort_order: idx,
          };
        });
        const { error: eError } = await supabase.from('exercises').insert(rows);
        if (eError) console.warn('saveWorkout exercises Supabase error:', eError.message);
      }
    } catch (err) {
      console.warn('saveWorkout failed:', err);
    }
  },

  saveWorkouts: (workouts: Workout[]): void => {
    localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(workouts));
    workouts.forEach(async (w) => {
      try { await storage.saveWorkout(w); } catch (e) { console.warn('saveWorkout silent error:', e); }
    });
  },

  deleteWorkout: async (workoutId: string): Promise<void> => {
    const all = storage.getWorkouts();
    const workoutToDelete = all.find(w => w.id === workoutId);
    const workoutName = workoutToDelete?.name;

    const remaining = all.filter(w => w.id !== workoutId);
    localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(remaining));

    // Track in deleted list so it's never restored by sync
    try {
      const deletedList: string[] = JSON.parse(localStorage.getItem('cadu_ponce_deleted_routines') || '[]');
      if (!deletedList.includes(workoutId)) deletedList.push(workoutId);
      if (workoutName && !deletedList.includes(workoutName)) deletedList.push(workoutName);
      localStorage.setItem('cadu_ponce_deleted_routines', JSON.stringify(deletedList));
    } catch {}

    try {
      await supabase.from('workouts').delete().eq('id', workoutId);
    } catch (e) {
      console.warn('deleteWorkout Supabase error:', e);
    }
    if (workoutName) {
      try {
        await supabase.from('workouts').delete().eq('name', workoutName);
      } catch {}
      try {
        await supabase.from('agenda_events').delete().eq('type', 'assigned_routine').ilike('title', workoutName);
        const tombstoneId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Math.random().toString(16).slice(2, 14).padStart(12, '0')}`;
        await supabase.from('agenda_events').insert({
          id: tombstoneId,
          student_id: 'all',
          student_name: 'all',
          title: workoutName,
          date: new Date().toISOString().split('T')[0],
          start_time: '00:00',
          end_time: '23:59',
          type: 'deleted_routine',
          notes: workoutId
        });
      } catch {}
    }
  },

  // ── Progress ──────────────────────────────────────────────────────────────

  getProgress: (): ProgressEntry[] => {
    const data = localStorage.getItem(CACHE_KEYS.PROGRESS);
    return data ? JSON.parse(data) : [];
  },

  fetchProgress: async (studentId: string): Promise<ProgressEntry[]> => {
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

    localStorage.setItem(CACHE_KEYS.PROGRESS, JSON.stringify(entries));
    return entries;
  },

  saveProgress: async (entry: ProgressEntry): Promise<void> => {
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
    localStorage.setItem(CACHE_KEYS.PROGRESS, JSON.stringify([entry, ...all]));
  },

  // ── Evolution Photos ──────────────────────────────────────────────────────

  getPhotos: (): EvolutionPhoto[] => {
    const data = localStorage.getItem(CACHE_KEYS.PHOTOS);
    return data ? JSON.parse(data) : [];
  },

  fetchPhotos: async (studentId: string): Promise<EvolutionPhoto[]> => {
    const { data, error } = await supabase
      .from('evolution_photos')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: false });

    if (error || !data) return storage.getPhotos();

    const photos: EvolutionPhoto[] = data.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      photoURL: row.photo_url,
      notes: row.notes ?? undefined,
      date: row.date,
    }));

    localStorage.setItem(CACHE_KEYS.PHOTOS, JSON.stringify(photos));
    return photos;
  },

  savePhoto: async (photo: EvolutionPhoto, file?: File): Promise<string> => {
    let photoURL = photo.photoURL;

    if (file) {
      const filePath = `${photo.studentId}/${photo.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('evolution-photos')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('evolution-photos').getPublicUrl(filePath);
      photoURL = urlData.publicUrl;
    }

    const { error } = await supabase.from('evolution_photos').insert({
      id: photo.id,
      student_id: photo.studentId,
      photo_url: photoURL,
      notes: photo.notes ?? null,
      date: photo.date,
    });
    if (error) throw error;

    const all = storage.getPhotos();
    const updated = { ...photo, photoURL };
    localStorage.setItem(CACHE_KEYS.PHOTOS, JSON.stringify([updated, ...all]));
    return photoURL;
  },

  deletePhoto: async (photoId: string): Promise<void> => {
    const { error } = await supabase.from('evolution_photos').delete().eq('id', photoId);
    if (error) throw error;
  },

  // ── Admin Routines (Fichas por Treino) ────────────────────────────────────
  // Stored in dedicated `admin_routines` + `admin_exercises` Supabase tables.

  ADMIN_ROUTINES_KEY: 'cadu_ponce_admin_routines',

  /** Fetches all admin routines with their exercises from Supabase. */
  fetchAdminRoutines: async (): Promise<AdminRoutine[]> => {
    const { data: routineRows, error: rErr } = await supabase
      .from('admin_routines')
      .select('*')
      .order('created_at', { ascending: false });

    if (rErr || !routineRows) {
      console.warn('fetchAdminRoutines fallback to local:', rErr?.message);
      const cached = localStorage.getItem('cadu_ponce_admin_routines');
      return cached ? JSON.parse(cached) : [];
    }

    const routineIds = routineRows.map(r => r.id as string);
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
    // Local cache may have new-column data (dayOfWeek, muscleGroup, etc.)
    // that wasn't stored in Supabase yet (if columns don't exist).
    const localCached: AdminRoutine[] = JSON.parse(localStorage.getItem('cadu_ponce_admin_routines') ?? '[]');
    const deletedList: string[] = JSON.parse(localStorage.getItem('cadu_ponce_deleted_routines') ?? '[]');
    const deletedSet = new Set(deletedList.map(s => s.toLowerCase().trim()));

    const isDeleted = (id?: string, name?: string) => {
      if (id && deletedSet.has(id.toLowerCase().trim())) return true;
      if (name && deletedSet.has(name.toLowerCase().trim())) return true;
      return false;
    };

    const validLocals = localCached.filter(l => !isDeleted(l.id, l.name));
    const validSupabaseRows = routineRows.filter(r => !isDeleted(r.id as string, r.name as string));
    const supabaseIds = new Set(validSupabaseRows.map(r => r.id as string));
    const unsyncedLocals = validLocals.filter(l => !supabaseIds.has(l.id));

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

    // Cloud sync via agenda_events (seamless cross-device sync with no RLS hurdles)
    try {
      const { data: cloudEvents } = await supabase
        .from('agenda_events')
        .select('*')
        .in('type', ['assigned_routine', 'deleted_routine']);

      if (cloudEvents && cloudEvents.length > 0) {
        for (const ev of cloudEvents) {
          if (ev.type === 'deleted_routine') {
            if (ev.title) deletedSet.add(ev.title.toLowerCase().trim());
            if (ev.notes) deletedSet.add(ev.notes.toLowerCase().trim());
          }
        }
        localStorage.setItem('cadu_ponce_deleted_routines', JSON.stringify(Array.from(deletedSet)));

        for (const ev of cloudEvents) {
          if (ev.type === 'assigned_routine' && ev.notes) {
            try {
              const parsed: AdminRoutine = JSON.parse(ev.notes);
              if (parsed && parsed.name && !isDeleted(parsed.id, parsed.name)) {
                const existingIdx = merged.findIndex(r => r.name.toLowerCase().trim() === parsed.name.toLowerCase().trim());
                if (existingIdx === -1) {
                  merged.push(parsed);
                } else {
                  merged[existingIdx] = { ...merged[existingIdx], ...parsed };
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
    const finalRoutines = merged.filter(r => !isDeleted(r.id, r.name));
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(finalRoutines));

    const cleanWorkouts = storage.getWorkouts().filter(w => !isDeleted(w.id, w.name));
    localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(cleanWorkouts));

    return finalRoutines;
  },

  /** Returns cached routines (sync, used while async fetch is in-flight). */
  getAdminRoutines: (): AdminRoutine[] => {
    const data = localStorage.getItem('cadu_ponce_admin_routines');
    return data ? JSON.parse(data) : [];
  },

  /** Upserts a single routine (and its exercises) to Supabase. */
  saveAdminRoutine: async (routine: AdminRoutine): Promise<void> => {
    // Always update local cache first so data is never lost
    const all = storage.getAdminRoutines();
    const idx = all.findIndex(r => r.id === routine.id);
    if (idx >= 0) all[idx] = routine; else all.unshift(routine);
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(all));

    // Cloud sync via agenda_events (works on all devices seamlessly)
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routine.id);
      const eventId = isUUID ? routine.id : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Math.random().toString(16).slice(2, 14).padStart(12, '0')}`);

      // Delete any previous tombstone for this routine name
      await supabase.from('agenda_events').delete().eq('type', 'deleted_routine').ilike('title', routine.name);

      await supabase.from('agenda_events').upsert({
        id: eventId,
        student_id: (routine.studentIds && routine.studentIds[0]) || 'all',
        student_name: (routine.studentNames && routine.studentNames.join(', ')) || 'Todos',
        title: routine.name,
        date: routine.startDate || new Date().toISOString().split('T')[0],
        start_time: '00:00',
        end_time: '23:59',
        type: 'assigned_routine',
        notes: JSON.stringify(routine)
      });
    } catch (e) {
      console.warn('saveAdminRoutine cloud sync error:', e);
    }

    // Try full upsert with new columns first
    const { error: rErr } = await supabase.from('admin_routines').upsert({
      id: routine.id,
      name: routine.name,
      goal: routine.goal ?? '',
      difficulty: routine.difficulty ?? '',
      day_of_week: routine.dayOfWeek ?? null,
      muscle_group: routine.muscleGroup ?? null,
      general_notes: routine.generalNotes ?? null,
      notes: routine.notes ?? null,
      student_ids: routine.studentIds ?? [],
      student_names: routine.studentNames ?? [],
      start_date: routine.startDate ?? null,
      end_date: routine.endDate ?? null,
      routine_group_name: routine.routineGroupName ?? null,
    });

    let savedOk = !rErr;

    // If failed (e.g. new columns don't exist yet), fall back to base columns only
    if (rErr) {
      console.warn('saveAdminRoutine full upsert failed, trying fallback:', rErr.message);
      const { error: fallbackErr } = await supabase.from('admin_routines').upsert({
        id: routine.id,
        name: routine.name,
        goal: routine.goal ?? '',
        difficulty: routine.difficulty ?? '',
        notes: routine.notes ?? null,
        student_ids: routine.studentIds ?? [],
        student_names: routine.studentNames ?? [],
      });
      if (fallbackErr) {
        console.error('saveAdminRoutine fallback also failed:', fallbackErr.message);
      } else {
        savedOk = true;
      }
    }

    // Save exercises if routine was persisted
    if (savedOk) {
      await supabase.from('admin_exercises').delete().eq('routine_id', routine.id);
      if (routine.exercises && routine.exercises.length > 0) {
        const rows = routine.exercises.map((e, i) => ({
          id: e.id || `aex_${Date.now()}_${i}`,
          routine_id: routine.id,
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          rest: e.rest ?? '60s',
          notes: e.notes ?? null,
          video_url: e.videoUrl ?? null,
          video_file_url: e.videoFileUrl ?? null,
          sort_order: i,
        }));
        await supabase.from('admin_exercises').insert(rows);
      }
    }
  },

  saveAdminRoutines: (routines: AdminRoutine[]): void => {
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(routines));
    routines.forEach(async (r) => {
      try { await storage.saveAdminRoutine(r); } catch { /* silent */ }
    });
  },

  /** Deletes a routine (and its exercises cascade) from Supabase. */
  deleteAdminRoutine: async (id: string): Promise<void> => {
    const all = storage.getAdminRoutines();
    const routineToDelete = all.find(r => r.id === id);
    const routineName = routineToDelete?.name;

    const remaining = all.filter(r => r.id !== id);
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(remaining));

    // Track in deleted list so it's never restored by sync
    try {
      const deletedList: string[] = JSON.parse(localStorage.getItem('cadu_ponce_deleted_routines') || '[]');
      if (!deletedList.includes(id)) deletedList.push(id);
      if (routineName && !deletedList.includes(routineName)) deletedList.push(routineName);
      localStorage.setItem('cadu_ponce_deleted_routines', JSON.stringify(deletedList));
    } catch {}

    // Cloud sync tombstone via agenda_events
    try {
      if (routineName) {
        await supabase.from('agenda_events').delete().eq('type', 'assigned_routine').ilike('title', routineName);
      }
      await supabase.from('agenda_events').delete().eq('type', 'assigned_routine').eq('id', id);

      const tombstoneId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Math.random().toString(16).slice(2, 14).padStart(12, '0')}`;
      await supabase.from('agenda_events').insert({
        id: tombstoneId,
        student_id: 'all',
        student_name: 'all',
        title: routineName || id,
        date: new Date().toISOString().split('T')[0],
        start_time: '00:00',
        end_time: '23:59',
        type: 'deleted_routine',
        notes: id
      });
    } catch (e) {
      console.warn('deleteAdminRoutine cloud sync tombstone error:', e);
    }

    // Also remove from workouts cache
    if (routineName) {
      try {
        const allWorkouts = storage.getWorkouts();
        const remainingWorkouts = allWorkouts.filter(w => w.id !== id && w.name.toLowerCase().trim() !== routineName.toLowerCase().trim());
        localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(remainingWorkouts));
      } catch {}
    }

    try {
      const { error } = await supabase.from('admin_routines').delete().eq('id', id);
      if (error) console.error('deleteAdminRoutine error:', error.message);
    } catch (e) {
      console.warn('deleteAdminRoutine Supabase error:', e);
    }

    if (routineName) {
      try {
        await supabase.from('workouts').delete().eq('name', routineName);
      } catch {}
    }
    try {
      await supabase.from('workouts').delete().eq('id', id);
    } catch {}
  },

  // --- AGENDA EVENTS ---
  fetchAgendaEvents: async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from('agenda_events')
      .select('*');
      
    if (error || !data) {
      const cached = localStorage.getItem('cp_agenda_events');
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
    
    localStorage.setItem('cp_agenda_events', JSON.stringify(events));
    return events;
  },

  getAgendaEvents: (): any[] => {
    const data = localStorage.getItem('cp_agenda_events');
    return data ? JSON.parse(data) : [];
  },

  saveAgendaEvent: async (event: any): Promise<void> => {
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
    localStorage.setItem('cp_agenda_events', JSON.stringify(events));
  },

  deleteAgendaEvent: async (id: string): Promise<void> => {
    const { error } = await supabase.from('agenda_events').delete().eq('id', id);
    if (error) console.error('deleteAgendaEvent error:', error.message);
    
    const events = storage.getAgendaEvents();
    const newEvents = events.filter((e: any) => e.id !== id);
    localStorage.setItem('cp_agenda_events', JSON.stringify(newEvents));
  },

  // ── Custom Exercises (Biblioteca de Exercícios) ───────────────────────────

  /** Fetches custom exercises from Supabase. */
  fetchCustomExercises: async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from('custom_exercises')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) {
      const cached = localStorage.getItem('cadu_ponce_exercises_v3');
      return cached ? JSON.parse(cached) : [];
    }

    const exercises = data.map(row => ({
      id: row.id,
      title: row.title,
      group: row.group,
      category: row.category,
      videoUrl: row.video_url ?? undefined,
      videoFileUrl: row.video_file_url ?? undefined,
      isCustom: true,
      image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&q=80&w=200', // Default image since it's not in DB
      description: 'Exercício personalizado adicionado pelo treinador.', // Default description
    }));

    localStorage.setItem('cadu_ponce_exercises_v3', JSON.stringify(exercises));
    return exercises;
  },

  /** Upserts a custom exercise to Supabase. */
  saveCustomExercise: async (exercise: any): Promise<void> => {
    const { error } = await supabase.from('custom_exercises').upsert({
      id: exercise.id,
      title: exercise.title,
      group: exercise.group,
      category: exercise.category,
      video_url: exercise.videoUrl ?? null,
      video_file_url: exercise.videoFileUrl ?? null,
    });
    if (error) console.error('saveCustomExercise error:', error.message);

    // Always update local cache
    const cached = localStorage.getItem('cadu_ponce_exercises_v3');
    const all: any[] = cached ? JSON.parse(cached) : [];
    const idx = all.findIndex((e: any) => e.id === exercise.id);
    if (idx >= 0) all[idx] = exercise; else all.unshift(exercise);
    localStorage.setItem('cadu_ponce_exercises_v3', JSON.stringify(all));
  },

  /** Deletes a custom exercise from Supabase. */
  deleteCustomExercise: async (id: string): Promise<void> => {
    const { error } = await supabase.from('custom_exercises').delete().eq('id', id);
    if (error) console.error('deleteCustomExercise error:', error.message);
    const cached = localStorage.getItem('cadu_ponce_exercises_v3');
    const all: any[] = cached ? JSON.parse(cached) : [];
    localStorage.setItem('cadu_ponce_exercises_v3', JSON.stringify(all.filter((e: any) => e.id !== id)));
  },

  // ── Muscle Groups & Categories ────────────────────────────────────────────

  fetchMuscleGroups: async (): Promise<string[]> => {
    const { data, error } = await supabase
      .from('muscle_groups')
      .select('name')
      .order('id', { ascending: true });

    if (error || !data || data.length === 0) return storage.getMuscleGroups();
    const groups = data.map(r => r.name as string);
    localStorage.setItem('cadu_ponce_muscle_groups', JSON.stringify(groups));
    return groups;
  },

  getMuscleGroups: (): string[] => {
    const data = localStorage.getItem('cadu_ponce_muscle_groups');
    return data ? JSON.parse(data) : ['Abdômen', 'Pernas', 'Peito', 'Ombros', 'Costas', 'Braços', 'Cardio', 'Core'];
  },

  saveMuscleGroups: async (groups: string[]): Promise<void> => {
    localStorage.setItem('cadu_ponce_muscle_groups', JSON.stringify(groups));
    await supabase.from('muscle_groups').delete().neq('id', 0);
    if (groups.length > 0) await supabase.from('muscle_groups').insert(groups.map(name => ({ name })));
  },

  fetchCategories: async (): Promise<string[]> => {
    const { data, error } = await supabase
      .from('exercise_categories')
      .select('name')
      .order('id', { ascending: true });

    if (error || !data || data.length === 0) return storage.getCategories();
    const cats = data.map(r => r.name as string);
    localStorage.setItem('cadu_ponce_categories', JSON.stringify(cats));
    return cats;
  },

  getCategories: (): string[] => {
    const data = localStorage.getItem('cadu_ponce_categories');
    return data ? JSON.parse(data) : ['Musculação', 'Funcional', 'Alongamento'];
  },

  saveCategories: async (categories: string[]): Promise<void> => {
    localStorage.setItem('cadu_ponce_categories', JSON.stringify(categories));
    await supabase.from('exercise_categories').delete().neq('id', 0);
    if (categories.length > 0) await supabase.from('exercise_categories').insert(categories.map(name => ({ name })));
  },

  uploadExerciseVideo: async (file: File, exerciseId: string): Promise<string> => {
    const ext = file.name.split('.').pop();
    const path = `exercises/${exerciseId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('exercise-videos').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('exercise-videos').getPublicUrl(path);
    return urlData.publicUrl;
  },

  // ── Legacy shims (kept for backward compat) ───────────────────────────────
  getUsersListSync: (): UserProfile[] => storage.getUsersList(),
  /** @deprecated no-op — data now goes directly to dedicated tables */
  syncAdminData: async (): Promise<void> => { /* no-op */ },
  /** @deprecated no-op shim */
  fetchAdminData: async (): Promise<null> => null,

  // ── Workout Logs ──────────────────────────────────────────────────────────
  // Stores completed session history for each student.

  WORKOUT_LOGS_KEY: 'cadu_workout_logs',

  /** Saves a completed workout session to Supabase and updates local cache. */
  saveWorkoutLog: async (log: WorkoutLog): Promise<void> => {
    // Persist to local cache immediately for instant UI feedback
    const all: WorkoutLog[] = storage.getWorkoutLogs();
    const updated = [log, ...all.filter(l => l.id !== log.id)];
    localStorage.setItem('cadu_workout_logs', JSON.stringify(updated));

    // Persist to Supabase in background
    try {
      await supabase.from('workout_logs').upsert({
        id: log.id,
        student_id: log.studentId,
        student_name: log.studentName ?? null,
        routine_id: log.routineId,
        routine_name: log.routineName,
        completed_at: log.completedAt,
        duration_seconds: log.durationSeconds,
        rpe: log.rpe,
        exercises_summary: log.exercisesSummary,
      });
    } catch (err) {
      console.warn('saveWorkoutLog Supabase error (log kept locally):', err);
    }
  },

  /** Returns cached workout logs synchronously. */
  getWorkoutLogs: (): WorkoutLog[] => {
    try {
      const data = localStorage.getItem('cadu_workout_logs');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  /** Fetches workout logs from Supabase for a specific student. */
  fetchWorkoutLogs: async (studentId: string): Promise<WorkoutLog[]> => {
    try {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('student_id', studentId)
        .order('completed_at', { ascending: false })
        .limit(100);

      if (error || !data) {
        return storage.getWorkoutLogs();
      }

      const logs: WorkoutLog[] = data.map(row => ({
        id: row.id as string,
        studentId: row.student_id as string,
        studentName: row.student_name as string | undefined,
        routineId: row.routine_id as string,
        routineName: row.routine_name as string,
        completedAt: row.completed_at as string,
        durationSeconds: row.duration_seconds as number,
        rpe: row.rpe as number,
        exercisesSummary: (row.exercises_summary as any[]) ?? [],
      }));

      localStorage.setItem('cadu_workout_logs', JSON.stringify(logs));
      return logs;
    } catch {
      return storage.getWorkoutLogs();
    }
  },
};
