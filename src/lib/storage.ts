/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * storage.ts — Supabase-backed data layer.
 * All functions are async and communicate with Supabase DB / Storage.
 * A localStorage fallback is kept for offline resilience (read-only cache).
 */

import { supabase } from './supabase';
import { Workout, ProgressEntry, EvolutionPhoto, UserProfile } from '../types';

// ---------------------------------------------------------------------------
// Local-storage cache keys (used as offline fallback – read only)
// ---------------------------------------------------------------------------
const CACHE_KEYS = {
  USER: 'cadu_ponce_user',
  WORKOUTS: 'cadu_ponce_workouts',
  PROGRESS: 'cadu_ponce_progress',
  PHOTOS: 'cadu_ponce_photos',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps a Supabase `profiles` row → app UserProfile */
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

/** Maps a Supabase `workouts` row (with joined `exercises`) → app Workout */
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

// ---------------------------------------------------------------------------
// Auth helpers (kept for compatibility with App.tsx)
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

    if (error || !data) {
      console.error('Error fetching profile:', error);
      return null;
    }
    const profile = rowToUserProfile(data);
    storage.saveUser(profile); // update cache
    return profile;
  },

  /** Fetches all profiles from Supabase (admin only). Use this for fresh data. */
  fetchUsersList: async (): Promise<UserProfile[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    const supabaseUsers = data.map(rowToUserProfile);
    
    // Merge with local cache so we don't lose users created locally without a password
    const localData = localStorage.getItem('cadu_ponce_all_users');
    const localUsers: UserProfile[] = localData ? JSON.parse(localData) : [];
    
    const mergedUsers = [...localUsers];
    supabaseUsers.forEach(su => {
      const idx = mergedUsers.findIndex(u => u.uid === su.uid || (u.email && su.email && u.email.toLowerCase() === su.email.toLowerCase()));
      if (idx === -1) {
        mergedUsers.push(su);
      } else {
        // Supabase is source of truth for these users
        mergedUsers[idx] = { ...mergedUsers[idx], ...su };
      }
    });

    // Update local cache
    localStorage.setItem('cadu_ponce_all_users', JSON.stringify(mergedUsers));
    return mergedUsers;
  },

  /** @deprecated – kept for legacy callers. Use getUsersList() (async) instead. */
  getUsersListSync: (): UserProfile[] => {
    // Return from local cache — callers should migrate to async getUsersList()
    const data = localStorage.getItem('cadu_ponce_all_users');
    return data ? JSON.parse(data) : [];
  },

  /** @legacy Alias so AccountManagement.tsx sync calls keep working via local cache. */
  getUsersList: (() => {
    // Return a dual-mode function: when called synchronously returns cache,
    // but also has async access. We implement this as a plain sync function
    // that returns the local cache. For full Supabase data, use fetchUsersList().
    return (): UserProfile[] => {
      const data = localStorage.getItem('cadu_ponce_all_users');
      return data ? JSON.parse(data) : [];
    };
  })(),

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
    storage.saveUser(user); // keep cache in sync
  },

  /** Creates a new student account via Supabase Auth + inserts profile row. */
  createStudentAccount: async (
    email: string,
    password: string,
    name: string,
    extraData?: Partial<UserProfile>
  ): Promise<UserProfile> => {
    // Sign up via Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: extraData?.role ?? 'student' },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Usuário não criado');

    // The handle_new_user trigger creates the profile row automatically.
    // We just need to enrich it with extra data if provided.
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

  /** Returns cached workouts (sync fallback). */
  getWorkouts: (): Workout[] => {
    const data = localStorage.getItem(CACHE_KEYS.WORKOUTS);
    return data ? JSON.parse(data) : [];
  },

  /** Fetches workouts for a student from Supabase. */
  fetchWorkouts: async (studentId?: string): Promise<Workout[]> => {
    let query = supabase
      .from('workouts')
      .select('*, exercises(*)')
      .order('created_at', { ascending: false });

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data, error } = await query;
    if (error || !data) return storage.getWorkouts(); // offline fallback

    const workouts = data.map(rowToWorkout);
    localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(workouts));
    return workouts;
  },

  /** Creates or replaces a workout (and its exercises) in Supabase. */
  saveWorkout: async (workout: Workout): Promise<void> => {
    // Upsert workout row
    const { error: wError } = await supabase.from('workouts').upsert({
      id: workout.id,
      name: workout.name,
      description: workout.description ?? null,
      student_id: workout.studentId,
    });
    if (wError) throw wError;

    // Delete old exercises and re-insert
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

  /** Deletes a workout and its exercises. */
  deleteWorkout: async (workoutId: string): Promise<void> => {
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
    if (error) throw error;
  },

  // ── Progress ──────────────────────────────────────────────────────────────

  /** Returns cached progress entries. */
  getProgress: (): ProgressEntry[] => {
    const data = localStorage.getItem(CACHE_KEYS.PROGRESS);
    return data ? JSON.parse(data) : [];
  },

  /** Fetches progress entries from Supabase for a student. */
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

  /** Inserts a new progress entry. */
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

    // Also update cache
    const all = storage.getProgress();
    localStorage.setItem(CACHE_KEYS.PROGRESS, JSON.stringify([entry, ...all]));
  },

  // ── Evolution Photos ──────────────────────────────────────────────────────

  /** Returns cached photos. */
  getPhotos: (): EvolutionPhoto[] => {
    const data = localStorage.getItem(CACHE_KEYS.PHOTOS);
    return data ? JSON.parse(data) : [];
  },

  /** Fetches evolution photos from Supabase for a student. */
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

  /**
   * Uploads a photo file to Supabase Storage and inserts a record.
   * Returns the public URL of the uploaded photo.
   */
  savePhoto: async (photo: EvolutionPhoto, file?: File): Promise<string> => {
    let photoURL = photo.photoURL;

    if (file) {
      const filePath = `${photo.studentId}/${photo.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('evolution-photos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('evolution-photos')
        .getPublicUrl(filePath);
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

    // Update cache
    const all = storage.getPhotos();
    const updated = { ...photo, photoURL };
    localStorage.setItem(CACHE_KEYS.PHOTOS, JSON.stringify([updated, ...all]));
    return photoURL;
  },

  /** Deletes a photo from Storage and from DB. */
  deletePhoto: async (photoId: string): Promise<void> => {
    const { error } = await supabase
      .from('evolution_photos')
      .delete()
      .eq('id', photoId);
    if (error) throw error;
  },

  // ── Legacy compatibility shims (used by AccountManagement.tsx) ─────────
  // These write to localStorage cache AND sync to Supabase asynchronously.

  /** @legacy Saves users list to local cache and upserts to Supabase in background. */
  saveUsersList: (users: UserProfile[]): void => {
    localStorage.setItem('cadu_ponce_all_users', JSON.stringify(users));
    // Sync changed profiles to Supabase in background (best-effort)
    users.forEach(async (u) => {
      try {
        await storage.updateProfile(u);
      } catch {
        // Ignore individual profile update errors silently
      }
    });
  },

  /** @legacy Saves workouts array to local cache and upserts each to Supabase in background. */
  saveWorkouts: (workouts: Workout[]): void => {
    localStorage.setItem(CACHE_KEYS.WORKOUTS, JSON.stringify(workouts));
    // Sync to Supabase in background (best-effort)
    workouts.forEach(async (w) => {
      try {
        await storage.saveWorkout(w);
      } catch {
        // Ignore errors silently
      }
    });
  },

  // ── Admin Routines ──────────────────────────────────────────────────────
  ADMIN_ROUTINES_KEY: 'cadu_ponce_admin_routines',

  getAdminRoutines: (): import('../types').AdminRoutine[] => {
    const data = localStorage.getItem('cadu_ponce_admin_routines');
    return data ? JSON.parse(data) : [];
  },

  saveAdminRoutines: (routines: import('../types').AdminRoutine[]): void => {
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(routines));
    storage.syncAdminData();
  },

  saveAdminRoutine: (routine: import('../types').AdminRoutine): void => {
    try {
      const all = storage.getAdminRoutines();
      const idx = all.findIndex(r => r.id === routine.id);
      if (idx >= 0) all[idx] = routine;
      else all.unshift(routine);
      localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(all));
      storage.syncAdminData();
    } catch (e) {
      console.error('Failed to save admin routine to localStorage', e);
    }
  },

  deleteAdminRoutine: (id: string): void => {
    const all = storage.getAdminRoutines().filter(r => r.id !== id);
    localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(all));
    storage.syncAdminData();
  },

  syncAdminData: async (): Promise<void> => {
    const user = storage.getUser();
    if (user && user.role === 'admin') {
      try {
        const metadata = user.metadata || {};
        metadata.adminRoutines = storage.getAdminRoutines();
        metadata.exercises = JSON.parse(localStorage.getItem('cadu_ponce_exercises_v3') || '[]');
        metadata.muscleGroups = JSON.parse(localStorage.getItem('cadu_ponce_muscle_groups') || '[]');
        metadata.categories = JSON.parse(localStorage.getItem('cadu_ponce_categories') || '[]');
        await storage.updateProfile({ ...user, metadata });
      } catch (err) {
        console.error('Failed to sync admin data to Supabase', err);
      }
    }
  },

  fetchAdminData: async (): Promise<{ routines?: import('../types').AdminRoutine[], exercises?: any[], muscleGroups?: string[], categories?: string[] } | null> => {
    const user = storage.getUser();
    if (user && user.role === 'admin') {
      try {
        const { supabase } = await import('./supabase');
        const { data, error } = await supabase.from('profiles').select('metadata').eq('id', user.uid).single();
        if (error) throw error;
        if (data && data.metadata) {
          const md = data.metadata as any;
          if (md.adminRoutines) {
            localStorage.setItem('cadu_ponce_admin_routines', JSON.stringify(md.adminRoutines));
          }
          if (md.exercises) {
            localStorage.setItem('cadu_ponce_exercises_v3', JSON.stringify(md.exercises));
          }
          if (md.muscleGroups) {
            localStorage.setItem('cadu_ponce_muscle_groups', JSON.stringify(md.muscleGroups));
          }
          if (md.categories) {
            localStorage.setItem('cadu_ponce_categories', JSON.stringify(md.categories));
          }
          return {
            routines: md.adminRoutines,
            exercises: md.exercises,
            muscleGroups: md.muscleGroups,
            categories: md.categories
          };
        }
      } catch (err) {
        console.error('Failed to fetch admin data from Supabase', err);
      }
    }
    return null;
  },

  // ── Categories & Muscle Groups ──────────────────────────────────────────
  getMuscleGroups: (): string[] => {
    const data = localStorage.getItem('cadu_ponce_muscle_groups');
    return data ? JSON.parse(data) : ['Abdômen', 'Pernas', 'Peito', 'Ombros', 'Costas', 'Braços', 'Cardio', 'Core'];
  },

  saveMuscleGroups: (groups: string[]): void => {
    localStorage.setItem('cadu_ponce_muscle_groups', JSON.stringify(groups));
  },

  getCategories: (): string[] => {
    const data = localStorage.getItem('cadu_ponce_categories');
    return data ? JSON.parse(data) : ['Musculação', 'Funcional', 'Alongamento'];
  },

  saveCategories: (categories: string[]): void => {
    localStorage.setItem('cadu_ponce_categories', JSON.stringify(categories));
  },

  uploadExerciseVideo: async (file: File, exerciseId: string): Promise<string> => {
    const { supabase } = await import('./supabase');
    const ext = file.name.split('.').pop();
    const path = `exercises/${exerciseId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('exercise-videos').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('exercise-videos').getPublicUrl(path);
    return urlData.publicUrl;
  },
};
