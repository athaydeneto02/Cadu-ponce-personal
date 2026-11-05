import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['src/lib/storage.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'isolated-services', setup(builder) {
    builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'test' }));
    builder.onResolve({ filter: /^\.\/mediaDb$/ }, () => ({ path: 'mediaDb', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'supabase'
      ? 'export const supabase = globalThis.testSupabase;'
      : `export const storeLocalFile = globalThis.testMedia.storeLocalFile;
         export const compressImage = async file => file;
         export const getLocalBlob = globalThis.testMedia.getLocalBlob;
         export const resolveMediaUrl = async value => value;
         export const toStorageReference = (bucket, path) => 'storage://' + bucket + '/' + path;
         export const clearMediaCache = () => {};`, loader: 'js' }));
  } }],
});

function localStorageFake() {
  const storage = Object.create(null);
  Object.defineProperties(storage, {
    getItem: { value: key => Object.hasOwn(storage, key) ? storage[key] : null },
    setItem: { value: (key, value) => Object.defineProperty(storage, key, { value: String(value), writable: true, configurable: true, enumerable: true }) },
    removeItem: { value: key => delete storage[key] },
  });
  return storage;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup({ query = async () => ({ data: [], error: null }), local = localStorageFake(), mediaUpload = async () => ({ error: null }), auth = {} } = {}) {
  const calls = [];
  const blobs = new Map();
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'fake-test-token' } } }), ...auth },
    storage: { from: bucket => ({ upload: async (path, blob) => { calls.push({ bucket, path, upload: true }); return mediaUpload(path, blob); } }) },
    rpc: async (name, args) => { const call = { table: name, operation: 'rpc', values: args, filters: [] }; calls.push(call); return query(call); },
    from(table) {
      const call = { table, operation: 'select', filters: [], values: undefined };
      const chain = {
        select() { return this; },
        upsert(values) { call.operation = 'upsert'; call.values = values; return this; },
        insert(values) { call.operation = 'insert'; call.values = values; return this; },
        update(values) { call.operation = 'update'; call.values = values; return this; },
        delete() { call.operation = 'delete'; return this; },
        eq(column, value) { call.filters.push(['eq', column, value]); return this; },
        in(column, value) { call.filters.push(['in', column, value]); return this; },
        order() { return this; }, limit() { return this; }, maybeSingle() { return this; }, single() { return this; },
        then(resolve, reject) { calls.push(call); return Promise.resolve(query(call)).then(resolve, reject); },
      };
      return chain;
    },
  };
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, testSupabase: supabase, localStorage: local,
    testMedia: { storeLocalFile: async blob => { const key = `idb:${randomUUID()}`; blobs.set(key, blob); return key; }, getLocalBlob: async key => blobs.get(key) ?? null },
    navigator: { onLine: true }, window: { dispatchEvent() {} }, Event, CustomEvent,
    crypto: { randomUUID }, console: { warn() {}, error() {}, log() {} },
    Blob, File, URL, setTimeout, clearTimeout,
  };
  vm.runInNewContext(compiled.outputFiles[0].text, context);
  const storage = module.exports.storage;
  storage.setSessionUser('student-a');
  storage.saveUser({ uid: 'student-a', name: 'Pessoa A', email: 'a@example.test', role: 'student', status: 'active', createdAt: '2026-11-05' });
  return { storage, calls, local, context, blobs };
}

const log = id => ({ id, studentId: 'student-a', studentName: 'Pessoa A', routineId: 'routine-a', routineName: 'Treino A', completedAt: '2026-11-05T12:00:00Z', durationSeconds: 300, rpe: 5, exercisesSummary: [], comment: 'Concluído com boa técnica.' });
const photo = id => ({ id, studentId: 'student-a', photoURL: 'blob:temporary-preview', date: '2026-11-05' });

test('role never comes from email or self-supplied metadata', async () => {
  const { storage } = setup({ query: async () => ({ data: { id: 'student-a', name: 'Pessoa A', email: 'cadu@example.test', role: 'student', metadata: { role: 'admin' } }, error: null }) });
  assert.equal((await storage.fetchProfile('student-a')).role, 'student');
});

test('an empty server user list replaces cached students instead of restoring them', async () => {
  const { storage } = setup();
  storage.setSessionUser('admin-a');
  storage.saveUsersList([{ uid: 'removed-student', name: 'Aluno removido', role: 'student' }]);
  assert.equal((await storage.fetchUsersList({ allowCached: false })).length, 0);
  assert.equal(storage.getUsersList().length, 0);
});

test('a server list containing only administrators removes cached students and preserves administrators', async () => {
  const { storage } = setup({ query: async () => ({
    data: [{ id: 'admin-a', name: 'Administrador', email: 'admin@example.test', role: 'admin', status: 'active' }], error: null,
  }) });
  storage.setSessionUser('admin-a');
  storage.saveUsersList([{ uid: 'removed-student', name: 'Aluno removido', role: 'student' },
    { uid: 'admin-a', name: 'Administrador', role: 'admin' }]);
  const users = await storage.fetchUsersList({ allowCached: false });
  assert.equal(users.length, 1);
  assert.equal(users[0].uid, 'admin-a');
  assert.equal(users[0].role, 'admin');
  assert.equal(storage.getUsersList().filter(user => user.role === 'student').length, 0);
  assert.equal(storage.getUsersList()[0].uid, 'admin-a');
});

test('account management rejects unavailable server lists without returning cached deleted students', async () => {
  for (const response of [{ data: null, error: new Error('Offline') }, { data: null, error: null }]) {
    const { storage } = setup({ query: async () => response });
    storage.setSessionUser('admin-a');
    storage.saveUsersList([{ uid: 'removed-student', name: 'Aluno removido', role: 'student' }]);
    await assert.rejects(storage.fetchUsersList({ allowCached: false }), /Offline|lista atual/);
    // Other callers retain their existing explicit cache policy; no account is deleted locally or remotely.
    assert.equal((await storage.fetchUsersList())[0].uid, 'removed-student');
  }
});

test('failed upload retains a durable local photo and never writes blob/idb to the server', async () => {
  const { storage, calls } = setup({ mediaUpload: async () => ({ error: new Error('Offline') }) });
  const result = await storage.savePhoto(photo('photo-a'), new File(['image'], 'photo.jpg', { type: 'image/jpeg' }));
  assert.match(result, /^idb:/);
  assert.equal(storage.getPhotos()[0].syncStatus, 'pending');
  assert.equal(calls.filter(call => call.operation === 'upsert').length, 0);
  assert.ok(storage.getPhotos()[0].localFileKey);
});

test('pending photos survive refresh and retry as a private durable reference', async () => {
  let fail = true;
  const { storage } = setup({ mediaUpload: async () => ({ error: fail ? new Error('Offline') : null }) });
  await storage.savePhoto(photo('photo-a'), new File(['image'], 'photo.jpg', { type: 'image/jpeg' }));
  await storage.fetchPhotos('student-a');
  assert.equal(storage.getPhotos().length, 1);
  fail = false;
  await storage.syncPendingData('student-a');
  assert.equal(storage.getPhotos()[0].syncStatus, 'synced');
  assert.match(storage.getPhotos()[0].photoURL, /^storage:\/\/evolution-photos\/student-a\//);
});

test('failed workout save survives a successful remote read and retries with comment intact', async () => {
  let fail = true;
  const { storage, calls } = setup({ query: async call => ({ data: [], error: call.table === 'workout_logs' && call.operation === 'upsert' && fail ? { message: 'Offline' } : null }) });
  await storage.saveWorkoutLog(log('log-a'));
  assert.equal(storage.getWorkoutLogs()[0].syncStatus, 'pending');
  await storage.fetchWorkoutLogs('student-a');
  assert.equal(storage.getWorkoutLogs().length, 1);
  fail = false;
  await storage.syncPendingData('student-a');
  assert.equal(storage.getWorkoutLogs()[0].syncStatus, 'synced');
  assert.equal(calls.findLast(call => call.table === 'workout_logs' && call.operation === 'upsert').values.comment, log('log-a').comment);
});

test('a fetch in flight cannot overwrite a newly saved pending workout', async () => {
  const gate = deferred();
  const { storage } = setup({ query: call => call.table === 'workout_logs' && call.operation === 'select' ? gate.promise : Promise.resolve({ data: [], error: new Error('Offline') }) });
  const fetching = storage.fetchWorkoutLogs('student-a');
  await storage.saveWorkoutLog(log('new-log'));
  gate.resolve({ data: [], error: null });
  await fetching;
  assert.equal(storage.getWorkoutLogs()[0].id, 'new-log');
});

test('a fetch in flight cannot overwrite a newly saved pending photo', async () => {
  const gate = deferred();
  const { storage } = setup({ query: call => call.table === 'evolution_photos' ? gate.promise : Promise.resolve({ data: [], error: null }), mediaUpload: async () => ({ error: new Error('Offline') }) });
  const fetching = storage.fetchPhotos('student-a');
  await storage.savePhoto(photo('new-photo'), new File(['image'], 'photo.jpg', { type: 'image/jpeg' }));
  gate.resolve({ data: [], error: null });
  await fetching;
  assert.equal(storage.getPhotos()[0].id, 'new-photo');
});

test('logout and another account cannot see or erase the previous outbox', async () => {
  const { storage, context } = setup();
  context.navigator.onLine = false;
  await storage.saveWorkoutLog(log('private-log'));
  storage.setSessionUser(null);
  assert.equal(storage.getWorkoutLogs().length, 0);
  storage.setSessionUser('student-b');
  assert.equal(storage.getWorkoutLogs().length, 0);
  storage.setSessionUser('student-a');
  assert.equal(storage.getWorkoutLogs()[0].id, 'private-log');
});

test('a late admin response writes only to that admin cache', async () => {
  const gate = deferred();
  const { storage } = setup({ query: () => gate.promise });
  storage.setSessionUser('admin-a');
  const fetching = storage.fetchUsersList();
  storage.setSessionUser('student-b');
  gate.resolve({ data: [{ id: 'private-student', email: 'private@example.test', role: 'student' }], error: null });
  await fetching;
  assert.equal(storage.getUsersList().length, 0);
  storage.setSessionUser('admin-a');
  assert.equal(storage.getUsersList()[0].uid, 'private-student');
});

test('legacy offline logs are migrated as pending rather than erased', async () => {
  const local = localStorageFake();
  local.setItem('cadu_ponce_user', JSON.stringify({ uid: 'student-a' }));
  local.setItem('cadu_workout_logs', JSON.stringify([log('legacy-log')]));
  const { storage } = setup({ local });
  await storage.fetchWorkoutLogs('student-a');
  assert.equal(storage.getWorkoutLogs()[0].id, 'legacy-log');
  assert.equal(storage.getWorkoutLogs()[0].syncStatus, 'pending');
});

test('registration awaiting email confirmation never manufactures an authenticated profile', async () => {
  const { storage, calls } = setup({ auth: { signUp: async () => ({ data: { user: { id: 'new-user' }, session: null }, error: null }) } });
  await assert.rejects(storage.createStudentAccount('new@example.test', 'long-safe-password', 'Nova Pessoa'), /Confirme o e-mail/);
  assert.equal(calls.length, 0);
});

test('registration reads the existing profile instead of calling a missing method', async () => {
  const { storage } = setup({ auth: { signUp: async () => ({ data: { user: { id: 'new-user' }, session: {} }, error: null }) }, query: async () => ({ data: { id: 'new-user', role: 'student', email: 'new@example.test' }, error: null }) });
  assert.equal((await storage.createStudentAccount('new@example.test', 'long-safe-password', 'Nova Pessoa')).uid, 'new-user');
});

test('deleting an assignment uses the transactional ID-scoped RPC and preserves same-name siblings', async () => {
  const { storage, calls } = setup({ query: async () => ({ data: true, error: null }) });
  const workouts = [{ id: 'a', studentId: 'student-a', name: 'Treino A' }, { id: 'b', studentId: 'student-b', name: 'Treino A' }];
  storage.setCacheItem('cadu_ponce_workouts', JSON.stringify(workouts));
  await storage.deleteWorkout('a', 'student-a');
  assert.equal(storage.getWorkouts().length, 1);
  assert.equal(storage.getWorkouts()[0].id, 'b');
  assert.equal(calls[0].table, 'delete_workout_assignment');
  assert.equal(calls[0].values.p_workout_id, 'a');
  assert.equal(calls[0].values.p_student_id, 'student-a');
  assert.equal(calls.some(call => call.filters.some(filter => filter[1] === 'name')), false);
});

test('failed transactional deletion leaves the local record intact', async () => {
  const { storage } = setup({ query: async () => ({ data: null, error: new Error('Denied') }) });
  storage.setCacheItem('cadu_ponce_workouts', JSON.stringify([{ id: 'a', studentId: 'student-a', name: 'Treino A' }]));
  await assert.rejects(storage.deleteWorkout('a', 'student-a'), /Denied/);
  assert.equal(storage.getWorkouts().length, 1);
});

test('photo upload finishing after a session switch cannot write metadata with the new identity', async () => {
  const gate = deferred();
  const { storage, calls } = setup({ mediaUpload: () => gate.promise });
  const saving = storage.savePhoto(photo('slow-photo'), new File(['image'], 'photo.jpg', { type: 'image/jpeg' }));
  while (!calls.some(call => call.upload)) await new Promise(resolve => setTimeout(resolve, 0));
  storage.setSessionUser('student-b');
  gate.resolve({ error: null });
  await saving;
  assert.equal(calls.some(call => call.operation === 'upsert'), false);
  assert.equal(storage.getPhotos().length, 0);
  storage.setSessionUser('student-a');
  assert.equal(storage.getPhotos()[0].syncStatus, 'pending');
});

for (const kind of ['routine', 'workout']) {
  test(`${kind} prescribed loads survive saving and loading on another device, including zero and decimals`, async () => {
    const rows = new Map();
    const query = async call => {
      const table = rows.get(call.table) ?? new Map();
      rows.set(call.table, table);
      if (call.operation === 'upsert') {
        for (const row of Array.isArray(call.values) ? call.values : [call.values]) {
          table.set(row.id, JSON.parse(JSON.stringify(row)));
        }
      }
      const selected = [...table.values()].filter(row => call.filters.every(([operator, column, value]) =>
        operator === 'in' ? value.includes(row[column]) : row[column] === value));
      if (call.operation === 'delete') for (const row of selected) table.delete(row.id);
      return { data: JSON.parse(JSON.stringify(selected)), error: null };
    };
    const trainer = setup({ query }).storage;
    const student = setup({ query }).storage;
    const prescription = { id: randomUUID(), name: 'Treino', studentId: 'student-a', studentIds: ['student-a'],
      exercises: [{ id: 'temporary-exercise', name: 'Agachamento', sets: 3, reps: '10', rest: '60s', prescribedLoads: [0, 10, 12.5] }] };
    const save = () => kind === 'routine' ? trainer.saveAdminRoutine(prescription) : trainer.saveWorkout(prescription);
    const fetch = () => kind === 'routine' ? student.fetchAdminRoutines() : student.fetchWorkouts('student-a');
    await save();
    const firstRead = await fetch();
    assert.deepEqual(Array.from(firstRead[0].exercises[0].prescribedLoads ?? []), [0, 10, 12.5]);
    const exerciseId = firstRead[0].exercises[0].id;
    prescription.exercises[0].prescribedLoads = [5, 15, 20];
    await save();
    const secondRead = await fetch();
    assert.equal(secondRead[0].exercises[0].id, exerciseId);
    assert.deepEqual(Array.from(secondRead[0].exercises[0].prescribedLoads), [5, 15, 20]);
    delete prescription.exercises[0].prescribedLoads;
    await save();
    assert.equal((await fetch())[0].exercises[0].prescribedLoads, undefined);
    assert.equal([...rows.get(kind === 'routine' ? 'admin_exercises' : 'exercises').values()][0].prescribed_loads, null);
  });
}
