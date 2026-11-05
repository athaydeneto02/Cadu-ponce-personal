import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['src/lib/storage.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"', 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'mock-server', setup(builder) {
    builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const supabase = globalThis.testSupabase;', loader: 'js' }));
  } }],
});
const key = name => `cadu:v2:admin-a:${name}`;
const cacheKey = key('cadu_ponce_exercises_v3');
const draftsKey = key('cadu_ponce_exercise_drafts');
const exercise = (id = 'exercise-a') => ({ id, title: 'Agachamento', group: 'Pernas', category: 'Livre', image: '',
  description: 'Instrução completa', videoUrl: '', videoFileUrl: 'storage://exercise-videos/exercises/demo.mp4', isCustom: true });

function harness() {
  const disk = new Map();
  let blocked = () => false;
  let failure = null;
  const rows = new Map();
  const calls = [];
  const localStorage = {
    getItem: name => disk.get(name) ?? null,
    setItem(name, value) { if (blocked(name)) throw new Error('QuotaExceededError'); disk.set(name, value); },
    removeItem: name => disk.delete(name),
  };
  const supabase = { from(table) {
    const call = { table, operation: 'select', filters: [] };
    const chain = {
      select() { return this; }, order() { return this; }, single() { call.single = true; return this; },
      upsert(value) { call.operation = 'upsert'; call.value = value; return this; },
      delete() { call.operation = 'delete'; return this; },
      eq(column, value) { call.filters.push([column, value]); return this; },
      then(resolve, reject) {
        calls.push(call);
        if (failure) return Promise.resolve({ data: null, error: failure }).then(resolve, reject);
        if (call.operation === 'upsert') rows.set(call.value.id, JSON.parse(JSON.stringify(call.value)));
        const result = [...rows.values()].filter(row => call.filters.every(([column, value]) => row[column] === value));
        if (call.operation === 'delete') result.forEach(row => rows.delete(row.id));
        return Promise.resolve({ data: call.single ? result.find(row => row.id === call.value?.id) : result, error: null }).then(resolve, reject);
      },
    };
    return chain;
  } };
  const module = { exports: {} };
  const context = { module, exports: module.exports, testSupabase: supabase, localStorage, console,
    crypto: { randomUUID }, URL, Blob, File, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(compiled.outputFiles[0].text, context);
  const storage = module.exports.storage;
  storage.setSessionUser('admin-a');
  return { storage, disk, rows, calls, block: predicate => { blocked = predicate; }, fail: value => { failure = value; } };
}

test('custom exercise round trip includes image, description, flags and durable signed media reference', async () => {
  const h = harness();
  const item = { ...exercise(), image: 'https://example.supabase.co/storage/v1/object/sign/exercise-videos/images/demo.gif?token=temporary', isCustom: false };
  await h.storage.saveCustomExercise(item);
  const row = h.rows.get(item.id);
  assert.equal(row.image, 'storage://exercise-videos/images/demo.gif');
  assert.equal(row.video_file_url, item.videoFileUrl);
  assert.equal(row.description, item.description);
  assert.equal(row.is_custom, false);
  h.disk.clear();
  const fetched = await h.storage.fetchCustomExercises();
  assert.equal(fetched[0].image, row.image);
  assert.equal(fetched[0].description, item.description);
  assert.equal(fetched[0].videoFileUrl, item.videoFileUrl);
});

test('failed custom save/delete never changes the cached library or reports success', async () => {
  const h = harness();
  const item = { ...exercise(), syncStatus: 'synced' };
  h.disk.set(cacheKey, JSON.stringify([item]));
  h.fail(new Error('RLS denied'));
  await assert.rejects(h.storage.saveCustomExercise({ ...item, title: 'Alterado' }), /RLS denied/);
  await assert.rejects(h.storage.deleteCustomExercise(item.id), /RLS denied/);
  assert.equal(JSON.parse(h.disk.get(cacheKey))[0].title, item.title);
});

test('large local media never reaches a custom-exercise database payload', async () => {
  const h = harness();
  for (const media of ['blob:preview', 'idb:video', 'data:video/mp4;base64,AAAA']) {
    await assert.rejects(h.storage.saveCustomExercise({ ...exercise(), videoFileUrl: media }), /Envie o arquivo/);
  }
  assert.equal(h.calls.length, 0);
});

test('successful remote save survives full browser storage without masquerading as a cloud failure', async () => {
  const h = harness();
  h.block(() => true);
  await h.storage.saveCustomExercise(exercise());
  assert.equal(h.rows.size, 1);
  assert.equal((await h.storage.fetchCustomExercises())[0].description, exercise().description);
});

test('same-ID legacy and pending drafts retain unsent edits and are visible without being uploaded', async () => {
  for (const status of [undefined, 'pending']) {
    const h = harness();
    h.rows.set('exercise-a', { id: 'exercise-a', title: 'Servidor', group: 'Pernas', category: 'Livre', image: 'https://example.test/old.jpg', description: 'Antigo', is_custom: true });
    const local = { ...exercise(), title: 'Edição local', image: 'data:image/png;base64,UNSENT', syncStatus: status };
    h.disk.set(cacheKey, JSON.stringify([local]));
    const result = await h.storage.fetchCustomExercises();
    assert.equal(result.length, 1);
    assert.equal(result[0].title, local.title);
    assert.equal(result[0].image, local.image);
    assert.equal(result[0].syncStatus, 'pending');
    assert.equal(JSON.parse(h.disk.get(draftsKey))[0].image, local.image);
    assert.equal(h.calls.some(call => call.operation !== 'select'), false);
  }
});

test('a full draft backup leaves the only existing media copy intact', async () => {
  const h = harness();
  const old = JSON.stringify([{ ...exercise(), image: 'data:image/png;base64,ONLY_COPY' }]);
  h.disk.set(cacheKey, old);
  h.block(name => name === draftsKey);
  const result = await h.storage.fetchCustomExercises();
  assert.equal(result[0].syncStatus, 'pending');
  assert.equal(h.disk.get(cacheKey), old);
  assert.equal(h.disk.has(draftsKey), false);
});

test('ID-based deletion preserves a same-name sibling and cannot resurrect confirmed deleted rows', async () => {
  const h = harness();
  await h.storage.saveCustomExercise(exercise('one'));
  await h.storage.saveCustomExercise(exercise('two'));
  await h.storage.deleteCustomExercise('one');
  assert.deepEqual(Array.from(await h.storage.fetchCustomExercises(), item => item.id), ['two']);
  assert.deepEqual(h.calls.find(call => call.operation === 'delete').filters, [['id', 'one']]);
  h.rows.clear();
  assert.equal((await h.storage.fetchCustomExercises()).length, 0);
});

test('local deletion tombstone must persist before reporting complete removal', async () => {
  const h = harness();
  h.disk.set(cacheKey, JSON.stringify([exercise()]));
  h.block(name => name.endsWith('cadu_ponce_deleted_custom_exercises'));
  await assert.rejects(h.storage.deleteCustomExercise('exercise-a'), /registrar a remoção do rascunho/);
  assert.equal(JSON.parse(h.disk.get(cacheKey)).length, 1);
});

test('confirmed save warns when a divergent same-ID draft cannot be replaced durably', async () => {
  const h = harness();
  const oldDraft = { ...exercise(), title: 'Edição antiga', syncStatus: 'pending' };
  h.disk.set(draftsKey, JSON.stringify([oldDraft]));
  h.block(name => name === draftsKey);
  await assert.rejects(h.storage.saveCustomExercise({ ...exercise(), title: 'Edição enviada' }), /salvo na nuvem.*rascunho antigo/);
  assert.equal(h.rows.get('exercise-a').title, 'Edição enviada');
  assert.equal(JSON.parse(h.disk.get(draftsKey))[0].title, 'Edição antiga');
});
