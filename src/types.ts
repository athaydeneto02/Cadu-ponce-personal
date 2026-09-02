/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  weight?: number;
  height?: number;
  trainerPhone?: string;
  role: 'admin' | 'student';
  password?: string;
  createdAt: string;
  status?: 'active' | 'inactive' | 'excluded';
  modality?: 'Presencial' | 'Online';
  metadata?: {
    group?: string;
    birthDate?: string;
    gender?: string;
    sendAccessInfo?: boolean;
    sendAnamnesis?: string;
    blockDefaulters?: string;
  };
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
  currentLoad?: number;
  prescribedLoads?: number[];
}

export interface Workout {
  id: string;
  name: string;
  description?: string;
  exercises: Exercise[];
  studentId: string;
  createdAt: string;
}

export interface ProgressEntry {
  id: string;
  studentId: string;
  exerciseName: string;
  load: number;
  reps: number;
  date: string;
  notes?: string;
}

export interface EvolutionPhoto {
  id: string;
  studentId: string;
  photoURL: string;
  date: string;
  notes?: string;
}

export interface Goal {
  id: string;
  title: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  category: 'strength' | 'frequency' | 'weight' | 'other';
  deadline?: string;
}

export interface AdminExercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
  videoUrl?: string;      // YouTube link or any URL
  videoFileUrl?: string;  // Supabase Storage public URL
  prescribedLoads?: number[];
}

export interface AdminRoutine {
  id: string;
  name: string;
  goal: string;
  difficulty: string;
  dayOfWeek?: string;       // e.g. "Segunda", "Terça", "Quarta" etc.
  muscleGroup?: string;     // e.g. "Peito, Tríceps e Ombro"
  generalNotes?: string;    // Orientações gerais do dia
  notes?: string;
  studentIds: string[];      // array of student IDs this is assigned to
  studentNames: string[];    // parallel array of student names
  startDate?: string;        // Per-student assignment start date (YYYY-MM-DD)
  endDate?: string;          // Per-student assignment end date (YYYY-MM-DD)
  routineGroupName?: string; // Groups multiple day-routines under one named routine
  exercises: AdminExercise[];
  createdAt: string;
}

export interface AgendaEvent {
  id: string;
  studentId: string;
  studentName?: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  type: 'presential' | 'online' | 'other';
  notes?: string;
  createdAt: string;
}

export interface WorkoutLogExercise {
  name: string;
  setsCompleted: number;
  totalSets: number;
  loads: number[];
}

export interface WorkoutLog {
  id: string;
  studentId: string;
  studentName?: string;
  routineId: string;
  routineName: string;
  completedAt: string; // ISO 8601
  durationSeconds: number;
  rpe: number; // 1-10
  exercisesSummary: WorkoutLogExercise[];
}

