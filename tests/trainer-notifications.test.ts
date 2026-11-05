import test from 'node:test';
import assert from 'node:assert/strict';
import { observeTrainerNotifications, TrainerNotification, uniqueNotifications } from '../src/lib/trainerNotifications';

const item = (id: string, time = '2026-11-05T12:00:00Z', isRead = false): TrainerNotification => ({
  id, studentId: 'student-a', studentName: 'Aluno', workoutTitle: 'Treino A', fullDate: time, isRead, type: 'completion',
});
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

test('initial unread history is quiet; new completions appear once across repeated realtime and polling updates', async () => {
  let rows = [item('history')];
  const snapshots: TrainerNotification[][] = [], banners: TrainerNotification[][] = [];
  const observer = observeTrainerNotifications({ fetch: async () => rows, onSnapshot: list => snapshots.push(list), onNew: list => banners.push(list), onError: assert.fail });
  await observer.refresh();
  assert.equal(banners.length, 0);
  rows = [item('new', '2026-11-05T13:00:00Z'), item('history'), item('new', '2026-11-05T13:00:00Z')];
  await observer.refresh();
  await observer.refresh();
  assert.deepEqual(snapshots.at(-1)?.map(value => value.id), ['new', 'history']);
  assert.equal(banners.length, 1);
  assert.equal(banners[0][0].id, 'new');
  rows = [item('new', '2026-11-05T13:00:00Z', true), item('already-read', '2026-11-05T14:00:00Z', true)];
  await observer.refresh();
  assert.equal(banners.length, 1);
  assert.equal(snapshots.at(-1)?.[1].isRead, true);
  observer.stop();
});

test('an event during loading queues a fresh read without overlapping requests or dropping the new completion', async () => {
  const gate = deferred<TrainerNotification[]>();
  let calls = 0;
  const banners: TrainerNotification[][] = [];
  const observer = observeTrainerNotifications({
    fetch: () => ++calls === 1 ? gate.promise : Promise.resolve([item('new'), item('old')]),
    onSnapshot() {}, onNew: rows => banners.push(rows), onError: assert.fail,
  });
  const initial = observer.refresh();
  const realtime = observer.refresh();
  const polling = observer.refresh();
  assert.equal(calls, 1);
  gate.resolve([item('old')]);
  await Promise.all([initial, realtime, polling]);
  assert.equal(calls, 2);
  assert.deepEqual(banners.flat().map(row => row.id), ['new']);
});

test('failed fetches keep the previous feed and do not turn history into new alerts after reconnection', async () => {
  let fail = true;
  const snapshots: TrainerNotification[][] = [], banners: TrainerNotification[][] = [];
  let errors = 0;
  const observer = observeTrainerNotifications({
    fetch: async () => { if (fail) throw new Error('offline'); return [item('existing')]; },
    onSnapshot: rows => snapshots.push(rows), onNew: rows => banners.push(rows), onError: () => errors++,
  });
  await observer.refresh();
  fail = false; await observer.refresh();
  fail = true; await observer.refresh();
  assert.equal(errors, 2);
  assert.equal(snapshots.length, 1);
  assert.equal(banners.length, 0);
});

test('closing the account discards an in-flight notification response', async () => {
  const gate = deferred<TrainerNotification[]>();
  let updates = 0;
  const observer = observeTrainerNotifications({ fetch: () => gate.promise, onSnapshot: () => updates++, onNew: () => updates++, onError: () => updates++ });
  const pending = observer.refresh();
  observer.stop();
  gate.resolve([item('private')]);
  await pending;
  assert.equal(updates, 0);
  assert.deepEqual(uniqueNotifications([item('a'), item('a')]).map(value => value.id), ['a']);
});
