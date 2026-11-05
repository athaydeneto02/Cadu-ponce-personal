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
         export const normalizeStoredMediaReference = value => value;
         export const clearMediaCache = () => {};`, loader: 'js' }));
  } }],
});

function localStorageFake() {
  const storage = Object.create(null);
  let quota = Infinity;
  let denyWrites = false;
  Object.defineProperties(storage, {
    getItem: { value: key => Object.hasOwn(storage, key) ? storage[key] : null },
    setItem: { value: (key, value) => {
      const next = String(value);
      const bytes = Object.entries(storage).filter(([storedKey]) => storedKey !== key).reduce((sum, [storedKey, storedValue]) => sum + storedKey.length + storedValue.length, 0) + key.length + next.length;
      if (denyWrites || bytes > quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      Object.defineProperty(storage, key, { value: next, writable: true, configurable: true, enumerable: true });
    } },
    removeItem: { value: key => delete storage[key] },
    setQuota: { value: value => { quota = value; } },
    denyWrites: { value: value => { denyWrites = value; } },
    usedBytes: { value: () => Object.entries(storage).reduce((sum, [key, value]) => sum + key.length + value.length, 0) },
  });
  return storage;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup({ query = async () => ({ data: [], error: null }), local = localStorageFake(), mediaUpload = async () => ({ error: null }), auth = {}, push = async () => ({ pending: false, sentCount: 1, failedCount: 0, skippedCount: 0 }) } = {}) {
  const calls = [];
  const events = [], pushes = [];
  const blobs = new Map();
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'fake-test-token', user: { id: 'student-a' } } } }), ...auth },
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
        neq(column, value) { call.filters.push(['neq', column, value]); return this; },
        is(column, value) { call.filters.push(['is', column, value]); return this; },
        gte(column, value) { call.filters.push(['gte', column, value]); return this; },
        lt(column, value) { call.filters.push(['lt', column, value]); return this; },
        range(from, to) { call.range = [from, to]; return this; },
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
    navigator: { onLine: true }, window: { dispatchEvent(event) { events.push(event); } }, Event, CustomEvent, AbortSignal,
    fetch: async (url, options) => { pushes.push({ url, options }); return { ok: true, json: async () => push(url, options) }; },
    crypto: { randomUUID }, console: { warn() {}, error() {}, log() {} },
    Blob, File, URL, setTimeout, clearTimeout,
  };
  vm.runInNewContext(compiled.outputFiles[0].text, context);
  const storage = module.exports.storage;
  storage.setSessionUser('student-a');
  storage.saveUser({ uid: 'student-a', name: 'Pessoa A', email: 'a@example.test', role: 'student', status: 'active', createdAt: '2026-11-05' });
  return { storage, calls, local, context, blobs, events, pushes };
}

const log = id => ({ id, studentId: 'student-a', studentName: 'Pessoa A', routineId: 'routine-a', routineName: 'Treino A', completedAt: '2026-11-05T12:00:00Z', durationSeconds: 300, rpe: 5, exercisesSummary: [], comment: 'Concluído com boa técnica.' });
const photo = id => ({ id, studentId: 'student-a', photoURL: 'blob:temporary-preview', date: '2026-11-05' });
const finishAsync = () => new Promise(resolve => setImmediate(resolve));

function cloudDatabase() {
  const tables = new Map();
  const query = async call => {
    const table = tables.get(call.table) ?? new Map();
    tables.set(call.table, table);
    if (call.operation === 'upsert' || call.operation === 'insert') {
      for (const row of Array.isArray(call.values) ? call.values : [call.values]) table.set(row.id ?? row.name, structuredClone(row));
    }
    const rows = [...table.values()].filter(row => call.filters.every(([op, column, value]) =>
      op === 'in' ? value.includes(row[column]) : op === 'neq' ? row[column] !== value : op === 'gte' ? row[column] >= value : op === 'lt' ? row[column] < value : row[column] === value));
    if (call.operation === 'delete') for (const row of rows) table.delete(row.id ?? row.name);
    return { data: structuredClone(call.range && call.operation === 'select' ? rows.slice(call.range[0], call.range[1] + 1) : rows), error: null };
  };
  return { tables, query };
}

test('completion marks the local day only after durable saving and delegates messages to the server', async () => {
  const { storage, events, calls, pushes } = setup();
  const saved = await storage.saveWorkoutLog(log('complete-day'));
  await finishAsync();
  assert.equal(saved.syncStatus, 'synced');
  assert.deepEqual(events.filter(event => event.type === 'cadu_workout_completed').map(event => event.detail.syncStatus), ['pending', 'synced']);
  assert.equal(calls.some(call => call.table === 'agenda_events'), false, 'client must not invent a completion notification');
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].url, '/api/workout-completed');
  assert.deepEqual(JSON.parse(pushes[0].options.body), { logId: 'complete-day' });
  assert.equal(storage.getWorkoutLogs()[0].notificationStatus, 'sent');
});

test('offline completion survives reload and sends the optional push only after synchronizing', async () => {
  const first = setup();
  first.context.navigator.onLine = false;
  const saved = await first.storage.saveWorkoutLog(log('offline-day'));
  assert.equal(saved.syncStatus, 'pending');
  assert.equal(first.pushes.length, 0);
  assert.equal(first.events[0].detail.logId, 'offline-day');
  const reloaded = setup({ local: first.local });
  await reloaded.storage.syncPendingData('student-a');
  await finishAsync();
  assert.equal(reloaded.storage.getWorkoutLogs()[0].syncStatus, 'synced');
  assert.equal(reloaded.storage.getWorkoutLogs()[0].completedAt, log('offline-day').completedAt);
  assert.equal(reloaded.pushes.length, 1);
});

test('optional push failure does not undo completion and is retried without resaving the workout', async () => {
  let attempts = 0;
  const { storage, calls, pushes } = setup({ push: async () => ({ pending: ++attempts === 1, sentCount: 0, failedCount: 1, skippedCount: 0 }) });
  await storage.saveWorkoutLog(log('push-retry'));
  await finishAsync();
  assert.equal(storage.getWorkoutLogs()[0].syncStatus, 'synced');
  assert.equal(storage.getWorkoutLogs()[0].notificationStatus, 'pending');
  await storage.syncPendingData('student-a');
  assert.equal(pushes.length, 2);
  assert.equal(calls.filter(call => call.table === 'workout_logs' && call.operation === 'upsert').length, 1);
  assert.equal(storage.getWorkoutLogs()[0].notificationStatus, 'sent');
});

test('a failed durable completion never emits a positive day', async () => {
  const { storage, local, events } = setup();
  local.denyWrites(true);
  await assert.rejects(storage.saveWorkoutLog(log('not-saved')));
  assert.equal(events.length, 0);
});

test('month history is paginated beyond 500 sessions and retains cached records outside the period', async () => {
  const cloud = cloudDatabase();
  const rows = new Map(Array.from({ length: 501 }, (_, index) => [`session-${index}`, {
    id: `session-${index}`, student_id: 'student-a', completed_at: '2026-11-05T12:00:00Z',
    routine_id: 'routine', routine_name: 'Treino', duration_seconds: 60, exercises_summary: [],
  }]));
  rows.set('last-month', { ...rows.get('session-0'), id: 'last-month', completed_at: '2026-10-15T12:00:00Z' });
  cloud.tables.set('workout_logs', rows);
  const { storage, calls } = setup({ query: cloud.query });
  storage.setCacheItem('cadu_workout_logs', JSON.stringify([{ ...log('october-local'), completedAt: '2026-10-10T12:00:00Z', syncStatus: 'pending' }]));
  const range = { from: '2026-11-01T03:00:00Z', to: '2026-12-01T03:00:00Z', allowCached: false };
  const found = await storage.fetchWorkoutLogs('student-a', range);
  assert.equal(found.length, 501);
  assert.equal(calls.filter(call => call.table === 'workout_logs').length, 2);
  assert.ok(storage.getWorkoutLogs().some(item => item.id === 'october-local'));
  assert.equal(found.some(item => item.id === 'last-month'), false);
});

test('admin reporting surfaces server failures and validates its date range', async () => {
  const { storage } = setup({ query: async () => ({ data: null, error: new Error('offline') }) });
  await assert.rejects(storage.fetchWorkoutLogsRange('2026-11-01T03:00:00Z', '2026-12-01T03:00:00Z'), /offline/);
  await assert.rejects(storage.fetchWorkoutLogsRange('invalid', 'invalid'), /Período/);
});

test('notification feed and read confirmation are scoped to the current recipient and errors are visible', async () => {
  let fail = false;
  const { storage, calls } = setup({ query: async call => fail ? { data: null, error: new Error('offline') }
    : call.operation === 'update' ? { data: { id: 'notice' }, error: null }
    : { data: [{ id: 'notice', workout_log_id: 'log', student_id: 'student', student_name: 'Aluno', routine_name: 'Treino A',
      completed_at: '2026-11-05T23:00:00Z', created_at: '2026-11-05T23:00:00Z', duration_seconds: 120, read_at: null }], error: null } });
  const feed = await storage.fetchTrainerNotifications();
  assert.equal(feed[0].workoutTitle, 'Treino A');
  assert.equal(feed[0].isRead, false);
  assert.ok(calls[0].filters.some(([, column, value]) => column === 'recipient_id' && value === 'student-a'));
  await storage.markTrainerNotificationRead('notice');
  assert.deepEqual(Object.keys(calls.at(-1).values), ['read_at']);
  fail = true;
  await assert.rejects(storage.markTrainerNotificationRead('notice'), /offline/);
  await assert.rejects(storage.fetchTrainerNotifications(), /offline/);
});

test('an older unread notification remains visible beyond the recent 100 notices', async () => {
  const notice = id => ({ id, workout_log_id: id, student_id: 'student', student_name: 'Aluno', routine_name: 'Treino',
    completed_at: '2026-11-05T12:00:00Z', created_at: '2026-11-05T12:00:00Z', read_at: '2026-11-05T12:01:00Z' });
  const { storage } = setup({ query: async call => ({ error: null, data: call.filters.some(([op]) => op === 'is')
    ? [{ ...notice('old-unread'), read_at: null, created_at: '2026-10-05T12:00:00Z' }]
    : Array.from({ length: 100 }, (_, index) => notice(`read-${index}`)) }) });
  const feed = await storage.fetchTrainerNotifications();
  assert.equal(feed.length, 101);
  assert.equal(feed.filter(item => !item.isRead)[0].id, 'old-unread');
});

test('a successful routine edit survives total cache failure and reloads from the cloud', async () => {
  const cloud = cloudDatabase();
  const { storage, local } = setup({ query: cloud.query });
  const routine = { id: randomUUID(), name: 'Treino salvo', studentIds: ['student-a'], exercises: [
    { id: 'draft', name: 'Agachamento', sets: 3, reps: '8', videoFileUrl: 'data:video/mp4;base64,' + 'A'.repeat(50000) },
  ] };
  local.denyWrites(true);
  await storage.saveAdminRoutine(routine);
  assert.equal(storage.getAdminRoutines()[0].name, routine.name);
  assert.equal(storage.getAdminRoutines()[0].exercises[0].videoFileUrl, routine.exercises[0].videoFileUrl, 'mutation caches may still contain unverified local siblings');
  assert.match(routine.exercises[0].videoFileUrl, /^data:/, 'only the cache copy is compacted');
  const reloaded = setup({ query: cloud.query, local });
  const loaded = await reloaded.storage.fetchAdminRoutines();
  assert.equal(loaded[0].name, routine.name);
  assert.equal(loaded[0].exercises[0].videoFileUrl, routine.exercises[0].videoFileUrl);
  assert.equal(loaded[0].exercises[0].id, routine.exercises[0].id);
  assert.equal(reloaded.storage.getAdminRoutines()[0].exercises[0].videoFileUrl, routine.exercises[0].videoFileUrl, 'the editable in-memory snapshot keeps complete media');
  assert.equal(local.getItem('cadu:v2:student-a:cadu_ponce_admin_routines'), null, 'never persist a partial editable snapshot');
});

test('all confirmed remote writes succeed when localStorage throws quota errors', async () => {
  const cloud = cloudDatabase();
  const { storage, local } = setup({ query: cloud.query });
  local.denyWrites(true);
  await storage.saveWorkout({ id: randomUUID(), studentId: 'student-a', name: 'Treino', exercises: [] });
  await storage.saveProgress({ id: randomUUID(), studentId: 'student-a', exerciseName: 'Remada', load: 0, reps: '10', date: '2026-11-05' });
  await storage.saveAgendaEvent({ id: randomUUID(), title: 'Sessão', type: 'workout', date: '2026-11-05' });
  await storage.saveFinancialInvoice({ id: randomUUID(), studentId: 'student-a', studentName: 'Aluno', amount: 10, dueDate: '2026-11-05', description: 'Mensalidade' });
  await storage.savePaymentSettings({ pixKey: 'example', instructions: 'Fale com o personal' });
  await storage.addMuscleGroup('Costas');
  await storage.addCategory('Funcional');
  assert.equal((await storage.fetchWorkouts('student-a')).length, 1);
  assert.equal((await storage.fetchProgress('student-a')).length, 1);
  assert.equal((await storage.fetchAgendaEvents()).length, 3);
  assert.equal((await storage.fetchFinancialInvoices()).length, 1);
  assert.equal((await storage.fetchPaymentSettings()).pixKey, 'example');
  assert.deepEqual(Array.from(await storage.fetchMuscleGroups()), ['Costas']);
  assert.deepEqual(Array.from(await storage.fetchCategories()), ['Funcional']);
});

test('quota recovery removes only confirmed disposable snapshots and preserves drafts, pending work and local files', async () => {
  const { storage, local, context, blobs } = setup();
  context.navigator.onLine = false;
  await storage.savePhoto(photo('pending-photo'), new File(['original-image'], 'photo.jpg', { type: 'image/jpeg' }));
  storage.setCacheItem('cadu_ponce_exercise_drafts', JSON.stringify([{ id: 'draft', image: 'data:image/jpeg;base64,original' }]));
  local.setItem('cadu:v2:student-b:cadu_workout_logs', JSON.stringify([{ ...log('other-account'), studentId: 'student-b', syncStatus: 'pending' }]));
  local.setItem('cadu_legacy_unsent', 'keep-original');
  storage.saveUsersList([{ uid: 'remote', name: 'A'.repeat(6000) }]);
  const protectedKeys = ['cadu:v2:student-a:cadu_ponce_photos', 'cadu:v2:student-a:cadu_ponce_exercise_drafts', 'cadu:v2:student-b:cadu_workout_logs', 'cadu_legacy_unsent'];
  const originals = protectedKeys.map(key => local.getItem(key));
  local.setQuota(local.usedBytes() + 10);
  await storage.saveWorkoutLog(log('new-pending'));
  protectedKeys.forEach((key, index) => assert.equal(local.getItem(key), originals[index], key));
  assert.equal(blobs.size, 1);
  assert.equal(storage.getWorkoutLogs()[0].syncStatus, 'pending');
  const reloaded = setup({ local });
  assert.equal(reloaded.storage.getWorkoutLogs()[0].id, 'new-pending');
});

test('an outbox that cannot persist rejects instead of claiming memory-only success', async () => {
  const { storage, local, calls, blobs } = setup();
  local.denyWrites(true);
  await assert.rejects(storage.saveWorkoutLog(log('unsaved')), error => error.name === 'QuotaExceededError');
  await assert.rejects(storage.savePhoto(photo('unsaved-photo'), new File(['original'], 'photo.jpg', { type: 'image/jpeg' })), error => error.name === 'QuotaExceededError');
  assert.equal(storage.getWorkoutLogs().length, 0);
  assert.equal(storage.getPhotos().length, 0);
  assert.equal(calls.length, 0, 'no upload or remote mutation without durable outbox');
  assert.equal(blobs.size, 1, 'a failed metadata write must not delete the original file');
});

test('cloud confirmation is not turned into a failed workout save when its cache update hits quota', async () => {
  const local = localStorageFake();
  const { storage } = setup({ local, query: async call => {
    if (call.table === 'workout_logs' && call.operation === 'upsert') local.denyWrites(true);
    return { data: [], error: null };
  } });
  await storage.saveWorkoutLog(log('confirmed'));
  assert.equal(storage.getWorkoutLogs()[0].syncStatus, 'synced');
  assert.equal(JSON.parse(local.getItem('cadu:v2:student-a:cadu_workout_logs'))[0].syncStatus, 'pending', 'durable retry copy remains until it can be replaced');
});

test('legacy media_storage records are never downloaded into the agenda cache or deleted', async () => {
  const { storage, calls, local } = setup({ query: async () => ({ data: [
    { id: 'media', type: 'media_storage', notes: 'data:video/mp4;base64,' + 'A'.repeat(10000) },
    { id: 'event', type: 'appointment', title: 'Avaliação' },
  ], error: null }) });
  assert.equal((await storage.fetchAgendaEvents()).length, 1);
  assert.ok(calls[0].filters.some(([op, column, value]) => op === 'neq' && column === 'type' && value === 'media_storage'));
  assert.equal(local.getItem('cadu:v2:student-a:cp_agenda_events').includes('base64'), false);
  assert.equal(calls.some(call => call.operation === 'delete'), false);
});

test('malformed optional caches cannot invalidate successful remote reads or saves', async () => {
  const cloud = cloudDatabase();
  const { storage, local } = setup({ query: cloud.query });
  local.setItem('cadu:v2:student-a:cadu_ponce_admin_routines', '{broken');
  assert.equal(storage.getAdminRoutines().length, 0);
  await storage.saveAdminRoutine({ id: randomUUID(), name: 'Rotina', exercises: [] });
  local.setItem('cadu:v2:student-a:cadu_ponce_workouts', '{broken');
  assert.equal((await storage.fetchWorkouts()).length, 0);
  assert.equal((await storage.fetchAdminRoutines())[0].name, 'Rotina');
});

test('failed server saves do not change confirmed cache or delete existing categories', async () => {
  const { storage, calls } = setup({ query: async call => ({
    data: call.operation === 'select' ? [{ id: 1, name: 'Existente' }] : null,
    error: call.operation === 'select' ? null : new Error('Denied'),
  }) });
  storage.setCacheItem('cp_agenda_events', JSON.stringify([{ id: 'original' }]));
  for (const action of [
    () => storage.saveAgendaEvent({ id: 'new' }),
    () => storage.deleteAgendaEvent('original'),
    () => storage.saveFinancialInvoice({ id: 'invoice' }),
    () => storage.deleteFinancialInvoice('invoice'),
    () => storage.savePaymentSettings({}),
    () => storage.addCategory('Nova'),
    () => storage.addMuscleGroup('Novo'),
  ]) await assert.rejects(action(), /Denied/);
  assert.equal(storage.getAgendaEvents()[0].id, 'original');
  assert.equal(calls.some(call => ['muscle_groups', 'exercise_categories'].includes(call.table) && call.operation === 'delete'), false);
});

test('a late response with full storage cannot leak cached progress into the next account', async () => {
  const gate = deferred();
  const { storage, local } = setup({ query: () => gate.promise });
  local.denyWrites(true);
  const saving = storage.saveProgress({ id: 'progress-a', studentId: 'student-a', exerciseName: 'Remada', load: 5, reps: '10', date: '2026-11-05' });
  storage.setSessionUser('student-b');
  gate.resolve({ data: [], error: null });
  await saving;
  assert.equal(storage.getProgress().length, 0);
  storage.setSessionUser('student-a');
  assert.equal(storage.getProgress()[0].id, 'progress-a');
});

test('a partial routine read keeps previous exercises instead of caching a destructive empty prescription', async () => {
  const { storage } = setup({ query: async call => ({
    data: call.table === 'admin_routines' ? [{ id: 'routine-a', name: 'Treino' }] : [],
    error: call.table === 'admin_exercises' ? new Error('Offline') : null,
  }) });
  storage.setCacheItem('cadu_ponce_admin_routines', JSON.stringify([{ id: 'routine-a', name: 'Treino', exercises: [{ id: 'exercise-a', name: 'Remada' }] }]));
  const routines = await storage.fetchAdminRoutines();
  assert.equal(routines[0].exercises[0].id, 'exercise-a');
  assert.equal(storage.getAdminRoutines()[0].exercises[0].id, 'exercise-a');
});

test('repeated legacy migrations never overwrite or erase a conflicting pending outbox', () => {
  const local = localStorageFake();
  local.setItem('cadu_ponce_user', JSON.stringify({ uid: 'student-a' }));
  local.setItem('cadu_workout_logs', JSON.stringify([log('legacy-original')]));
  local.setItem('cadu:v2:student-a:cadu_workout_logs', JSON.stringify([{ ...log('newer-original'), syncStatus: 'pending' }]));
  setup({ local });
  assert.match(local.getItem('cadu_workout_logs'), /legacy-original/);
  assert.match(local.getItem('cadu:v2:student-a:cadu_workout_logs'), /newer-original/);
});

test('reclaiming an older disk snapshot retains the latest confirmed memory value', async () => {
  const { storage, local, context } = setup();
  storage.saveUsersList([{ uid: 'old', name: 'A'.repeat(3000) }]);
  local.denyWrites(true);
  storage.saveUsersList([{ uid: 'new', name: 'B'.repeat(6000) }]);
  assert.equal(storage.getUsersList()[0].uid, 'new');
  local.denyWrites(false);
  local.setQuota(local.usedBytes() + 5);
  context.navigator.onLine = false;
  await storage.saveWorkoutLog(log('durable-after-reclaim'));
  assert.equal(storage.getUsersList()[0].uid, 'new');
  assert.equal(storage.getWorkoutLogs()[0].syncStatus, 'pending');
});

for (const [table, add, remove] of [
  ['muscle_groups', 'addMuscleGroup', 'removeMuscleGroup'],
  ['exercise_categories', 'addCategory', 'removeCategory'],
]) {
  test(`${table} edits apply a delta and preserve names another administrator added`, async () => {
    const cloud = cloudDatabase();
    cloud.tables.set(table, new Map([
      ['Existente', { name: 'Existente' }], ['Outro administrador', { name: 'Outro administrador' }],
    ]));
    const { storage, calls } = setup({ query: cloud.query });
    const added = await storage[add]('Nova');
    assert.deepEqual(Array.from(added).sort(), ['Existente', 'Nova', 'Outro administrador'].sort());
    const removed = await storage[remove]('Existente');
    assert.deepEqual(Array.from(removed).sort(), ['Nova', 'Outro administrador'].sort());
    assert.equal(cloud.tables.get(table).has('Outro administrador'), true);
    assert.deepEqual(calls.find(call => call.operation === 'delete').filters, [['eq', 'name', 'Existente']]);
  });

  test(`${table} list failure after a delta never triggers a replacement or unrelated deletion`, async () => {
    const { storage, calls } = setup({ query: async call => ({
      data: call.operation === 'select' ? null : [], error: call.operation === 'select' ? new Error('Offline') : null,
    }) });
    await assert.rejects(storage[add]('Nova'), /alteração foi salva.*recarregar/);
    assert.equal(calls.filter(call => call.operation === 'upsert').length, 1);
    assert.equal(calls.some(call => call.operation === 'delete'), false);
  });
}

test('legacy quota migration keeps the owner until every pending record has moved', () => {
  const local = localStorageFake();
  local.setItem('cadu_ponce_user', JSON.stringify({ uid: 'student-a' }));
  local.setItem('cadu_workout_logs', JSON.stringify([log('legacy-pending')]));
  local.setQuota(local.usedBytes());
  const { storage } = setup({ local });
  assert.match(local.getItem('cadu_ponce_user'), /student-a/);
  assert.match(local.getItem('cadu_workout_logs'), /legacy-pending/);
  local.setQuota(Infinity);
  storage.setSessionUser('student-b');
  assert.equal(local.getItem('cadu_workout_logs'), null);
  assert.match(local.getItem('cadu:v2:student-a:cadu_workout_logs'), /legacy-pending/);
  assert.equal(local.getItem('cadu:legacy:cadu_workout_logs'), null);
  assert.equal(storage.getWorkoutLogs().length, 0);
});

test('a profile update must confirm the intended row before updating its cache', async () => {
  for (const response of [
    { data: null, error: null },
    { data: { id: 'different-user' }, error: null },
    { data: null, error: new Error('Profile update denied') },
  ]) {
    const { storage } = setup({ query: async () => response });
    const original = storage.getUser();
    await assert.rejects(storage.updateProfile({ ...original, name: 'Não salvo' }), /não foi atualizado|denied/);
    assert.equal(storage.getUser().name, original.name);
  }
  const { storage, local } = setup({ query: async () => ({ data: { id: 'student-a' }, error: null }) });
  local.denyWrites(true);
  await storage.updateProfile({ ...storage.getUser(), name: 'Salvo na nuvem' });
  assert.equal(storage.getUser().name, 'Salvo na nuvem');
});

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

test('an older fetch cannot erase a newly synchronized workout or turn its day negative', async () => {
  const gate = deferred();
  const { storage } = setup({ query: call => call.table === 'workout_logs' && call.operation === 'select' ? gate.promise : Promise.resolve({ data: [], error: null }) });
  const fetching = storage.fetchWorkoutLogs('student-a');
  await storage.saveWorkoutLog(log('new-synced-log'));
  await finishAsync();
  gate.resolve({ data: [], error: null });
  const result = await fetching;
  assert.equal(result[0].id, 'new-synced-log');
  assert.equal(result[0].syncStatus, 'synced');
  assert.equal(storage.getWorkoutLogs()[0].id, 'new-synced-log');
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
