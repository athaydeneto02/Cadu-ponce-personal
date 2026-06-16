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
