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
import { Workout, ProgressEntry, EvolutionPhoto, UserProfile, AdminRoutine, AdminExercise } from '../types';

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
    notes: (row.notes as string) ?? undefined,
    studentIds: (row.student_ids as string[]) ?? [],
    studentNames: (row.student_names as string[]) ?? [],
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

    return {
      uid: data.user.id,
      name,
      email,
      role: (extraData?.role as 'admin' | 'student') ?? 'student',
      createdAt: new Date().toISOString(),
      ...extraData,
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
    if (error || !data) return storage.getWorkouts();

    const workouts = data.map(rowToWorkout);
    localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(workouts));
    return workouts;
  },

  saveWorkout: async (workout: Workout): Promise<void> => {
    const { error: wError } = await supabase.from('workouts').upsert({
      id: workout.id,
      name: workout.name,
      description: workout.description ?? null,
      student_id: workout.studentId,
    });
    if (wError) throw wError;

    await supabase.from('exercises').delete().eq('workout_id', workout.id);

    if (workout.exercises.length > 0) {
      const rows = workout.exercises.map((e, idx) => ({
        id: e.id,
        workout_id: workout.id,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        rest: e.rest ?? '60s',
        notes: e.notes ?? null,
        current_load: e.currentLoad ?? 0,
        sort_order: idx,
      }));
      const { error: eError } = await supabase.from('exercises').insert(rows);
      if (eError) throw eError;
    }
  },

  saveWorkouts: (workouts: Workout[]): void => {
    localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(workouts));
    workouts.forEach(async (w) => {
      try { await storage.saveWorkout(w); } catch { /* silent */ }
    });
  },

  deleteWorkout: async (workoutId: string): Promise<void> => {
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
    if (error) throw error;
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

    const routines = routineRows.map(row =>
      rowToAdminRoutine(row, exercisesByRoutine[row.id as string] ?? [])
    );

    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(routines));
    return routines;
  },

  /** Returns cached routines (sync, used while async fetch is in-flight). */
  getAdminRoutines: (): AdminRoutine[] => {
    const data = localStorage.getItem('cadu_ponce_admin_routines');
    return data ? JSON.parse(data) : [];
  },

  /** Upserts a single routine (and its exercises) to Supabase. */
  saveAdminRoutine: async (routine: AdminRoutine): Promise<void> => {
    const { error: rErr } = await supabase.from('admin_routines').upsert({
      id: routine.id,
      name: routine.name,
      goal: routine.goal ?? '',
      difficulty: routine.difficulty ?? '',
      notes: routine.notes ?? null,
      student_ids: routine.studentIds ?? [],
      student_names: routine.studentNames ?? [],
    });

    if (rErr) {
      console.error('saveAdminRoutine error:', rErr.message);
    } else {
      // Replace exercises
      await supabase.from('admin_exercises').delete().eq('routine_id', routine.id);
      if (routine.exercises && routine.exercises.length > 0) {
        const rows = routine.exercises.map((e, idx) => ({
          id: e.id || `aex_${Date.now()}_${idx}`,
          routine_id: routine.id,
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          rest: e.rest ?? '60s',
          notes: e.notes ?? null,
          video_url: e.videoUrl ?? null,
          video_file_url: e.videoFileUrl ?? null,
          sort_order: idx,
        }));
        await supabase.from('admin_exercises').insert(rows);
      }
    }

    // Always update local cache
    const all = storage.getAdminRoutines();
    const idx = all.findIndex(r => r.id === routine.id);
    if (idx >= 0) all[idx] = routine; else all.unshift(routine);
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(all));
  },

  saveAdminRoutines: (routines: AdminRoutine[]): void => {
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(routines));
    routines.forEach(async (r) => {
      try { await storage.saveAdminRoutine(r); } catch { /* silent */ }
    });
  },

  /** Deletes a routine (and its exercises cascade) from Supabase. */
  deleteAdminRoutine: async (id: string): Promise<void> => {
    const { error } = await supabase.from('admin_routines').delete().eq('id', id);
    if (error) console.error('deleteAdminRoutine error:', error.message);
    const all = storage.getAdminRoutines().filter(r => r.id !== id);
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(all));
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
};
