import type { AdminRoutine, Workout, WorkoutLog } from '../types';
import { localWorkoutDateKey } from './workoutFrequency';

export type StudentRoutine = AdminRoutine & { legacyWorkoutId?: string };
export type StudentWorkoutKind = 'strength' | 'aerobic' | 'extra';

export function routineIsVisible(routine: Pick<AdminRoutine, 'startDate' | 'endDate' | 'hideBeforeStart' | 'hideAfterEnd'>, today = new Date()): boolean {
  const day = localWorkoutDateKey(today)!;
  return !(routine.hideBeforeStart && routine.startDate && day < routine.startDate.slice(0, 10)) &&
    !(routine.hideAfterEnd && routine.endDate && day > routine.endDate.slice(0, 10));
}

/** Exact UID and prescription ID are authoritative. Old workout-only prescriptions remain usable. */
export function studentWorkoutCatalog(routines: AdminRoutine[], workouts: Workout[], studentId: string, today = new Date()): StudentRoutine[] {
  const known = new Set(routines.map(routine => routine.id));
  const result: StudentRoutine[] = routines.filter(routine => routine.studentIds?.includes(studentId) && routineIsVisible(routine, today));
  for (const workout of workouts) {
    if (workout.studentId !== studentId || (workout.routineId && known.has(workout.routineId)) || !routineIsVisible(workout, today)) continue;
    const id = workout.routineId || workout.id;
    if (result.some(item => item.id === id)) continue;
    result.push({ ...workout, id, legacyWorkoutId: workout.id, goal: '', difficulty: '',
      generalNotes: workout.description, studentIds: [studentId], studentNames: [], exercises: workout.exercises });
  }
  return result;
}

export function routineWorkoutLogs(logs: WorkoutLog[], routine: StudentRoutine, studentId: string): WorkoutLog[] {
  const ids = new Set([routine.id, routine.legacyWorkoutId].filter(Boolean));
  return logs.filter(log => log.studentId === studentId && ids.has(log.routineId) && Number.isFinite(Date.parse(log.completedAt)))
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}

export function actualWorkoutLoads(log: WorkoutLog): { name: string; loads: number[]; completed: number; total: number }[] {
  return log.exercisesSummary.filter(exercise => exercise.setsCompleted > 0).map(exercise => ({
    name: exercise.name, loads: exercise.loads.filter(load => Number.isFinite(load) && load >= 0),
    completed: exercise.setsCompleted, total: exercise.totalSets,
  }));
}
