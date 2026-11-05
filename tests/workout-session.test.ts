import test from 'node:test';
import assert from 'node:assert/strict';
import { initialExerciseLoads, completedWorkoutVolume } from '../src/lib/workoutSession';

const exercise = { id: 'exercise', name: 'Remada', sets: 3, reps: '10', rest: '60s', currentLoad: 25 };

test('session respects explicitly prescribed zero and decimal loads', () => {
  assert.deepEqual(initialExerciseLoads({ ...exercise, prescribedLoads: [0, 12.5] }), [0, 12.5, 25]);
});

test('session volume includes actual checked sets, even out of order', () => {
  assert.equal(completedWorkoutVolume([exercise], { exercise: [10, 20, 30] }, { exercise: [false, true, true] }), 500);
  assert.equal(completedWorkoutVolume([exercise], { exercise: [10, 20, 30] }, { exercise: [false, false, false] }), 0);
});
