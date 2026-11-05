import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const frequency = { exports: {}, Date }; vm.runInNewContext(transpile('../src/lib/workoutFrequency.ts'), frequency);
const context = { exports: {}, Date, require: () => frequency.exports }; vm.runInNewContext(transpile('../src/lib/studentWorkouts.ts'), context);
const { studentWorkoutCatalog, routineWorkoutLogs, actualWorkoutLoads } = context.exports;
const routine = { id: 'r', name: 'Mesmo nome', studentIds: ['a'], exercises: [], kind: 'aerobic', startDate: '2026-11-01', endDate: '2026-11-30' };

test('student catalog includes legacy workouts, preserves kind and flags, and never uses a name or another UID', () => {
  const result = studentWorkoutCatalog([routine], [
    { id: 'copy', routineId: 'r', studentId: 'a', name: 'Duplicada', exercises: [] },
    { id: 'legacy', studentId: 'a', name: 'Mesmo nome', kind: 'extra', allowPdf: false, showTimer: false, exercises: [] },
    { id: 'foreign', studentId: 'b', name: 'Mesmo nome', exercises: [] },
  ], 'a', new Date(2026, 10, 5));
  assert.deepEqual(Array.from(result, item => item.id), ['r', 'legacy']);
  assert.equal(result[1].kind, 'extra'); assert.equal(result[1].allowPdf, false); assert.equal(result[1].showTimer, false);
  assert.deepEqual(Array.from(result[1].studentIds), ['a']);
});

test('local validity boundaries are inclusive and a hidden prescription cannot reappear through its workout copy', () => {
  const hidden = { ...routine, hideBeforeStart: true, hideAfterEnd: true };
  const copies = [{ id: 'copy', routineId: 'r', studentId: 'a', exercises: [] }];
  assert.equal(studentWorkoutCatalog([hidden], copies, 'a', new Date(2026, 9, 31, 23, 59)).length, 0);
  assert.equal(studentWorkoutCatalog([hidden], copies, 'a', new Date(2026, 10, 1)).length, 1);
  assert.equal(studentWorkoutCatalog([hidden], copies, 'a', new Date(2026, 10, 30, 23, 59)).length, 1);
  assert.equal(studentWorkoutCatalog([hidden], copies, 'a', new Date(2026, 11, 1)).length, 0);
  assert.equal(studentWorkoutCatalog([routine], [], 'a', new Date(2026, 11, 1)).length, 1, 'visibility follows the personal’s explicit flags');
});

test('history belongs to the student and prescription ID; actual loads come only from performed exercises', () => {
  const summary = [{ name: 'Bicicleta', setsCompleted: 1, totalSets: 1, loads: [0, 20.5] }, { name: 'Não realizado', setsCompleted: 0, totalSets: 3, loads: [99] }];
  const logs = routineWorkoutLogs([
    { id: 'one', studentId: 'a', routineId: 'r', completedAt: '2026-11-01T13:00:00Z', exercisesSummary: summary },
    { id: 'two', studentId: 'a', routineId: 'r', completedAt: '2026-11-02T13:00:00Z', exercisesSummary: summary },
    { id: 'foreign', studentId: 'b', routineId: 'r', completedAt: '2026-11-03T13:00:00Z', exercisesSummary: summary },
    { id: 'name-only', studentId: 'a', routineId: 'other', routineName: routine.name, completedAt: '2026-11-03T13:00:00Z', exercisesSummary: summary },
  ], routine, 'a');
  assert.deepEqual(Array.from(logs, log => log.id), ['two', 'one']);
  assert.equal(actualWorkoutLoads(logs[0]).length, 1);
  assert.deepEqual(Array.from(actualWorkoutLoads(logs[0])[0].loads), [0, 20.5]);
});

function drafts() {
  const disk = new Map();
  const cacheForUser = uid => ({
    readJson: (key, fallback) => JSON.parse(disk.get(`${uid}/${key}`) || JSON.stringify(fallback)),
    setItem: (key, value) => disk.set(`${uid}/${key}`, value), removeItem: key => disk.delete(`${uid}/${key}`),
  });
  const context = { exports: {}, Date, require: () => ({ cacheForUser }) }; vm.runInNewContext(transpile('../src/lib/workoutDraft.ts'), context);
  return context.exports;
}
test('elapsed time catches suspended intervals, pauses, and never runs backwards', () => {
  const { elapsedWorkoutSeconds, pauseWorkoutClock } = drafts();
  const clock = { elapsedSeconds: 20, runStartedAt: 100_000 };
  assert.equal(elapsedWorkoutSeconds(clock, 400_000), 320);
  const paused = pauseWorkoutClock(clock, 400_000);
  assert.equal(elapsedWorkoutSeconds(paused, 900_000), 320);
  assert.equal(elapsedWorkoutSeconds(clock, 10_000, 325), 325);
});
test('reopening restores checked exercises and loads only for the same account/prescription, never a completed session', () => {
  const api = drafts();
  const exercise = { id: 'ex', name: 'Agachamento', sets: 3, reps: '10', rest: '60s' };
  const fingerprint = api.workoutDraftFingerprint([exercise]);
  const draft = { id: 'session', studentId: 'a', routineId: 'r', exerciseIds: ['ex'], prescriptionFingerprint: fingerprint, startedAt: '2026-11-05T12:00:00Z', clock: { elapsedSeconds: 50, runStartedAt: null }, completed: ['ex'], loads: { ex: [40] } };
  api.saveWorkoutDraft(draft);
  assert.equal(api.readWorkoutDraft('a', 'r', ['ex'], [], fingerprint).loads.ex[0], 40);
  assert.equal(api.readWorkoutDraft('b', 'r', ['ex'], [], fingerprint), null);
  assert.equal(api.readWorkoutDraft('a', 'r', ['new-prescription'], [], fingerprint), null);
  assert.equal(api.readWorkoutDraft('a', 'r', ['ex'], [{ id: 'session', studentId: 'a', syncStatus: 'pending' }], fingerprint), null);
  api.removeWorkoutDraft('a', 'r'); assert.equal(api.readWorkoutDraft('a', 'r', ['ex'], [], fingerprint), null);
});

test('changing prescribed dose or activity invalidates completed draft checkmarks even when exercise IDs stay the same', () => {
  const api = drafts(), exercise = { id: 'ex', name: 'Agachamento', sets: 3, reps: '10', rest: '60s' };
  const fingerprint = api.workoutDraftFingerprint([exercise]);
  const draft = { id: 'session', studentId: 'a', routineId: 'r', exerciseIds: ['ex'], prescriptionFingerprint: fingerprint, startedAt: '2026-11-05T12:00:00Z', clock: { elapsedSeconds: 50, runStartedAt: null }, completed: ['ex'], loads: { ex: [40] } };
  api.saveWorkoutDraft(draft);
  for (const change of [{ sets: 4 }, { name: 'Avanço' }, { reps: '15' }, { prescribedLoads: [50] }]) {
    assert.equal(api.readWorkoutDraft('a', 'r', ['ex'], [], api.workoutDraftFingerprint([{ ...exercise, ...change }])), null);
  }
  const cosmetic = api.workoutDraftFingerprint([{ ...exercise, videoUrl: 'https://example.test/new-video', currentLoad: 55 }]);
  assert.equal(api.readWorkoutDraft('a', 'r', ['ex'], [], cosmetic).id, draft.id);
  assert.equal(api.readWorkoutDraft('a', 'r', ['ex'], [], api.workoutDraftFingerprint([exercise], 'Novas orientações')), null);
  api.saveWorkoutDraft({ ...draft, prescriptionFingerprint: undefined });
  assert.equal(api.readWorkoutDraft('a', 'r', ['ex'], [], fingerprint), null, 'legacy drafts cannot attest to the current prescription');
});
