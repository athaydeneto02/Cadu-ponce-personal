import type { AdminExercise, WorkoutLog } from '../types';
import { cacheForUser } from './sessionCache';

export interface WorkoutClock { elapsedSeconds: number; runStartedAt: number | null }
export interface WorkoutDraft {
  id: string; studentId: string; routineId: string; exerciseIds: string[]; prescriptionFingerprint: string;
  startedAt: string; stoppedAt?: string; clock: WorkoutClock;
  completed: string[]; loads: Record<string, number[]>; checkedSets?: Record<string, boolean[]>;
  notes?: Record<string, string>; rating?: string; comment?: string; completion?: WorkoutLog;
}

export function elapsedWorkoutSeconds(clock: WorkoutClock, now = Date.now(), previous = 0): number {
  const delta = clock.runStartedAt === null ? 0 : Math.max(0, (now - clock.runStartedAt) / 1000);
  return Math.max(previous, Math.floor(Math.max(0, clock.elapsedSeconds) + delta));
}
export function pauseWorkoutClock(clock: WorkoutClock, now = Date.now(), previous = 0): WorkoutClock {
  return { elapsedSeconds: elapsedWorkoutSeconds(clock, now, previous), runStartedAt: null };
}
const key = (routineId: string) => `cadu_workout_session_${routineId}`;
/** Dose, activity and instructions identify the prescription being performed.
 * Assignment membership, display flags, video links and actual loads do not. */
export function workoutDraftFingerprint(exercises: readonly AdminExercise[], instructions = ''): string {
  return JSON.stringify([instructions.trim(), exercises.map(exercise => [
    exercise.id, exercise.name.trim(), exercise.sets, String(exercise.reps).trim(), String(exercise.rest ?? '').trim(),
    exercise.notes?.trim() ?? '', exercise.prescribedLoads ?? [], !!exercise.combinedWithNext, exercise.combinedGroup ?? '',
  ])]);
}
export function readWorkoutDraft(studentId: string | undefined, routineId: string, exerciseIds: string[], completedLogs: WorkoutLog[], prescriptionFingerprint: string): WorkoutDraft | null {
  if (!studentId) return null;
  const draft = cacheForUser(studentId).readJson<WorkoutDraft | null>(key(routineId), null);
  if (!draft || typeof draft.id !== 'string' || !Array.isArray(draft.completed) || !draft.loads || typeof draft.loads !== 'object' || draft.studentId !== studentId || draft.routineId !== routineId || !Array.isArray(draft.exerciseIds) ||
    !prescriptionFingerprint || draft.prescriptionFingerprint !== prescriptionFingerprint ||
    draft.exerciseIds.join('|') !== exerciseIds.join('|') || !draft.clock || !Number.isFinite(draft.clock.elapsedSeconds) ||
    (draft.clock.runStartedAt !== null && !Number.isFinite(draft.clock.runStartedAt)) || !Number.isFinite(Date.parse(draft.startedAt)) ||
    completedLogs.some(log => log.id === draft.id && log.studentId === studentId)) return null;
  return draft;
}
export function saveWorkoutDraft(draft: WorkoutDraft): void { cacheForUser(draft.studentId).setItem(key(draft.routineId), JSON.stringify(draft)); }
export function removeWorkoutDraft(studentId: string, routineId: string): void { cacheForUser(studentId).removeItem(key(routineId)); }
