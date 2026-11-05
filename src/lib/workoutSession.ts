import type { Exercise } from '../types';

export function initialExerciseLoads(exercise: Exercise): number[] {
  const sets = Math.max(1, Number(exercise.sets) || 1);
  return Array.from({ length: sets }, (_, index) =>
    exercise.prescribedLoads?.[index] ?? exercise.currentLoad ?? 0);
}

export function completedWorkoutVolume(
  exercises: Exercise[], loads: Record<string, number[]>, checkedSets: Record<string, boolean[]>,
): number {
  return exercises.reduce((total, exercise) => {
    const reps = Number.parseInt(exercise.reps, 10) || 1;
    return total + (checkedSets[exercise.id] ?? []).reduce((volume, checked, index) =>
      volume + (checked ? (loads[exercise.id]?.[index] ?? 0) * reps : 0), 0);
  }, 0);
}
