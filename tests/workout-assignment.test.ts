import assert from 'node:assert/strict';
import test from 'node:test';
import { routineMatchesUser } from '../src/lib/workoutAssignment.ts';

test('a routine is available only to its explicitly assigned user ID', () => {
  const routine = { studentIds: ['student-b'], studentNames: ['Mariana Costa'] };
  assert.equal(routineMatchesUser(routine, { uid: 'student-a', name: 'Maria Alves' } as any), false);
  assert.equal(routineMatchesUser(routine, { uid: 'student-b' }), true);
  assert.equal(routineMatchesUser(routine, { id: 'student-b' }), true);
});

test('identical display names and email addresses do not grant access', () => {
  const routine = { studentIds: ['original-user'], studentNames: ['Maria Alves'] };
  assert.equal(routineMatchesUser(routine, { uid: 'different-user', name: 'Maria Alves', email: 'maria@example.test' } as any), false);
  assert.equal(routineMatchesUser({ studentIds: [] }, { uid: 'original-user' }), false);
  assert.equal(routineMatchesUser(routine, null), false);
  assert.equal(routineMatchesUser(routine, {}), false);
});
