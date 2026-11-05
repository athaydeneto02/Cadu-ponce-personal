import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const projectOrigin = 'https://project.example.test';
const compiled = await build({
  entryPoints: ['src/lib/mediaDb.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(projectOrigin) },
  plugins: [{ name: 'media-isolated-services', setup(builder) {
    builder.onResolve({ filter: /^(react|\.\/supabase|\.\/sessionCache)$/ }, ({ path }) => ({ path, namespace: 'media-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'media-test' }, ({ path }) => ({ contents:
      path === './supabase' ? 'export const supabase = globalThis.testSupabase;' :
      path === './sessionCache' ? 'export const getCacheUser = () => globalThis.testState.actor; export const cacheForUser = uid => ({ readJson: (key, fallback) => globalThis.testState.caches.get(uid + ":" + key) ?? fallback });' :
      'export const useState = (...args) => globalThis.testReact.useState(...args); export const useEffect = (...args) => globalThis.testReact.useEffect(...args);',
      loader: 'js',
    }));
  } }],
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup({ sign, agenda, localRead, download, remove, localDeleteError, hooks } = {}) {
  const state = { actor: 'student-a', time: 1_000_000, caches: new Map() };
  const signedCalls = [];
  const agendaCalls = [];
  const localCalls = [];
  const created = [];
  const revoked = [];
  const fetchCalls = [];
  const removeCalls = [];
  const localDeletes = [];
  const localRecords = new Map();
  const listeners = new Map(), intervals = new Map(); let nextInterval = 0;
  const events = { addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); } };
  class Clock extends Date { static now() { return state.time; } }
  class MediaURL extends URL {
    static createObjectURL(blob) {
      const url = `blob:test-${created.length + 1}`;
      created.push({ url, blob });
      return url;
    }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const transaction = { objectStore() { return { get(id) {
        localCalls.push(id);
        const request = {};
        queueMicrotask(async () => {
          try {
            request.result = await (localRead ? localRead(id) : localRecords.get(id));
            request.onsuccess?.();
          } catch (error) {
            request.error = error;
            request.onerror?.();
          }
        });
        return request;
      }, put(record) { localRecords.set(record.id, record); queueMicrotask(() => transaction.oncomplete?.()); },
      delete(id) {
        localDeletes.push(id);
        queueMicrotask(() => {
          if (localDeleteError) { transaction.error = new Error('Local delete denied'); transaction.onerror?.(); }
          else { localRecords.delete(id); transaction.oncomplete?.(); }
        });
      } }; } };
      return transaction;
    },
  };
  const supabase = {
    storage: { from(bucket) { return { async createSignedUrl(path, seconds) {
      const call = { bucket, path, seconds, actor: state.actor };
      signedCalls.push(call);
      return sign ? sign(call) : { data: { signedUrl: `${projectOrigin}/signed/${state.actor}/${signedCalls.length}` }, error: null };
    }, async remove(paths) {
      const call = { bucket, paths, actor: state.actor }; removeCalls.push(call);
      return remove ? remove(call) : { data: paths.map(name => ({ name })), error: null };
    } }; } },
    from(table) {
      const call = { table, id: undefined, actor: state.actor };
      return {
        select() { return this; },
        eq(column, value) { if (column === 'id') call.id = value; return this; },
        single() { agendaCalls.push(call); return agenda ? agenda(call) : Promise.resolve({ data: null, error: null }); },
      };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, {
    module, exports: module.exports, testSupabase: supabase, testState: state, testReact: hooks,
    Date: Clock, URL: MediaURL, Blob, Uint8Array, atob,
    console: { log() {}, warn() {}, error() {} },
    window: { ...events, indexedDB: { open() {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    } } },
    document: { ...events, visibilityState: 'visible' },
    fetch: async url => { fetchCalls.push(url); if (download) return download(url); throw new Error('Network access is forbidden in this test'); },
    setTimeout, clearTimeout, setInterval: (callback, delay) => { const id = ++nextInterval; intervals.set(id, { callback, delay }); return id; }, clearInterval: id => intervals.delete(id),
  });
  const media = module.exports;
  return {
    media, state, signedCalls, agendaCalls, localCalls, created, revoked, fetchCalls, removeCalls, localDeletes, localRecords, intervals,
    dispatch: name => listeners.get(name)?.forEach(callback => callback()),
    switchActor(actor) { state.actor = actor; media.clearMediaCache(); },
  };
}

test('durable references and legacy public/signed URLs resolve through authenticated signing', async () => {
  const { media, signedCalls } = setup();
  const durable = 'storage://evolution-photos/student-a/foto de evolução.jpg';
  const signed = await media.resolveMediaUrl(durable);
  const legacyPath = `${projectOrigin}/storage/v1/object/public/evolution-photos/student-a/foto%20de%20evolu%C3%A7%C3%A3o.jpg`;
  assert.equal(await media.resolveMediaUrl(legacyPath), signed);
  assert.equal(await media.resolveMediaUrl(legacyPath.replace('/public/', '/sign/') + '?token=expired'), signed);
  assert.deepEqual(signedCalls, [{ bucket: 'evolution-photos', path: 'student-a/foto de evolução.jpg', seconds: 600, actor: 'student-a' }]);
});

test('a ten-minute private URL is cached for eight minutes and renewed before expiration', async () => {
  const { media, state, signedCalls } = setup();
  const ref = 'storage://exercise-videos/trainer/video.mp4';
  const first = await media.resolveMediaUrl(ref);
  state.time += 8 * 60 * 1000 - 1;
  assert.equal(await media.resolveMediaUrl(ref), first);
  assert.equal(signedCalls.length, 1);
  state.time++;
  assert.notEqual(await media.resolveMediaUrl(ref), first);
  assert.equal(signedCalls.length, 2);
  assert.equal(signedCalls[1].seconds, 600);
});

test('logout blocks private media and another account never reuses the previous signed URL', async () => {
  const { media, switchActor, signedCalls } = setup();
  const ref = 'storage://evolution-photos/student-a/photo.jpg';
  const first = await media.resolveMediaUrl(ref);
  switchActor(null);
  assert.equal(await media.resolveMediaUrl(ref), '');
  assert.equal(signedCalls.length, 1);
  switchActor('student-b');
  const second = await media.resolveMediaUrl(ref);
  assert.notEqual(second, first);
  assert.equal(signedCalls[1].actor, 'student-b');
});

test('a signed URL response from the previous account is discarded and cannot reseed the cache', async () => {
  const gate = deferred();
  let calls = 0;
  const env = setup({ sign: () => ++calls === 1 ? gate.promise : Promise.resolve({ data: { signedUrl: 'https://signed.example.test/student-b' }, error: null }) });
  const ref = 'storage://evolution-photos/student-a/photo.jpg';
  const pending = env.media.resolveMediaUrl(ref);
  env.switchActor('student-b');
  gate.resolve({ data: { signedUrl: 'https://signed.example.test/student-a' }, error: null });
  assert.equal(await pending, '');
  assert.equal(await env.media.resolveMediaUrl(ref), 'https://signed.example.test/student-b');
  assert.equal(env.signedCalls.length, 2);
});

test('a denied signing request does not cache or expose an unauthorized URL', async () => {
  let denied = true;
  const env = setup({ sign: async () => denied
    ? { data: null, error: new Error('Permission denied') }
    : { data: { signedUrl: 'https://signed.example.test/authorized' }, error: null } });
  const ref = 'storage://evolution-photos/student-a/photo.jpg';
  assert.equal(await env.media.resolveMediaUrl(ref), '');
  denied = false;
  assert.equal(await env.media.resolveMediaUrl(ref), 'https://signed.example.test/authorized');
  assert.equal(env.signedCalls.length, 2);
});

test('legacy supamedia response from a previous account cannot populate the shared blob cache', async () => {
  const gate = deferred();
  let calls = 0;
  const env = setup({ agenda: () => ++calls === 1 ? gate.promise : Promise.resolve({ data: null, error: new Error('Permission denied') }) });
  const pending = env.media.resolveMediaUrl('supamedia:private-photo');
  env.switchActor('student-b');
  gate.resolve({ data: { notes: 'data:image/jpeg;base64,aW1hZ2U=' }, error: null });
  assert.equal(await pending, '');
  assert.equal(await env.media.resolveMediaUrl('supamedia:private-photo'), '');
  assert.equal(env.agendaCalls.length, 2);
});

test('a local media read started by the previous account cannot reseed the cleared cache', async () => {
  const gate = deferred();
  const started = deferred();
  let reads = 0;
  const env = setup({ localRead: () => {
    reads++;
    if (reads === 1) { started.resolve(); return gate.promise; }
    return undefined;
  } });
  const pending = env.media.resolveMediaUrl('idb:private-photo');
  await started.promise;
  env.switchActor('student-b');
  gate.resolve({ blob: new Blob(['private-image'], { type: 'image/jpeg' }) });
  assert.equal(await pending, '');
  assert.equal(await env.media.resolveMediaUrl('idb:private-photo'), '');
  assert.equal(env.localCalls.length, 2);
});

test('private video loading resolves a storage reference without downloading into shared caches', async () => {
  const env = setup();
  const ref = 'storage://exercise-videos/trainer/video.mp4';
  const signed = await env.media.getCachedVideoBlobUrl(ref);
  assert.equal(signed, await env.media.resolveMediaUrl(ref));
  assert.equal(env.signedCalls.length, 1);
  assert.equal(env.localCalls.length, 0);
  assert.equal(env.fetchCalls.length, 0);
});

test('an unrelated host with a Supabase-looking path is never signed by this project', async () => {
  const env = setup();
  const external = 'https://external.example.test/storage/v1/object/public/evolution-photos/file.jpg';
  assert.equal(await env.media.resolveMediaUrl(external), external);
  assert.equal(env.signedCalls.length, 0);
});

test('external videos play directly without fetching untrusted HTML into an application-origin blob or shared cache', async () => {
  const env = setup({ download: async () => ({ ok: true, blob: async () => new Blob(['<script>stealToken()</script>'], { type: 'text/html' }) }) });
  const suffix = '/long-common-directory-name/example-video-demonstration.mp4';
  const first = 'https://first.example.test/a' + suffix;
  const second = 'https://second.example.test/b' + suffix;
  const firstUrl = await env.media.getCachedVideoBlobUrl(first);
  const secondUrl = await env.media.getCachedVideoBlobUrl(second);
  assert.equal(firstUrl, first); assert.equal(secondUrl, second);
  assert.deepEqual(env.fetchCalls, []);
  env.media.clearMediaCache();
  await env.media.getCachedVideoBlobUrl(first);
  assert.equal(env.fetchCalls.length, 0);
  assert.equal(env.created.length, 0); assert.equal(env.localRecords.size, 0);
});

test('confirmed local deletion removes only the exact file and revokes its object URL', async () => {
  const env = setup();
  const key = await env.media.storeLocalFile(new Blob(['remove'], { type: 'image/jpeg' }), 'photo');
  const keep = await env.media.storeLocalFile(new Blob(['keep'], { type: 'image/jpeg' }), 'photo');
  const oldUrl = await env.media.resolveMediaUrl(key);
  await env.media.deleteLocalFile(key, 'student-a');
  assert.equal(await env.media.getLocalBlob(key), null);
  assert.equal(await (await env.media.getLocalBlob(keep)).text(), 'keep');
  assert.deepEqual(env.revoked, [oldUrl]);
  assert.equal(env.removeCalls.length, 0);
});

test('failed local deletion preserves its blob and a session switch prevents deletion', async () => {
  const env = setup({ localDeleteError: true });
  const key = await env.media.storeLocalFile(new Blob(['keep'], { type: 'image/jpeg' }), 'photo');
  await assert.rejects(env.media.deleteLocalFile(key), /delete denied/);
  assert.equal(await (await env.media.getLocalBlob(key)).text(), 'keep');
  env.switchActor('student-b');
  await assert.rejects(env.media.deleteLocalFile(key, 'student-a'), /sessão mudou/);
  assert.equal(env.localDeletes.length, 1);
});

test('stored media cleanup is scoped to the private project bucket, invalidates signing and surfaces errors', async () => {
  let fail = true;
  const env = setup({ remove: async () => fail ? { error: new Error('Denied') } : { error: null } });
  const ref = 'storage://evolution-photos/student-a/photo.jpg';
  await env.media.resolveMediaUrl(ref);
  await assert.rejects(env.media.deleteStoredMedia(ref), /remover o arquivo/);
  fail = false;
  await env.media.deleteStoredMedia(ref);
  await env.media.resolveMediaUrl(ref);
  assert.equal(env.signedCalls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(env.removeCalls[1])), { bucket: 'evolution-photos', paths: ['student-a/photo.jpg'], actor: 'student-a' });
  await env.media.deleteStoredMedia('https://another.example.test/file.jpg');
  await assert.rejects(env.media.deleteStoredMedia('storage://evolution-photos/student-a/../other.jpg'), /Caminho/);
  await assert.rejects(env.media.deleteStoredMedia('storage://unknown/path'), /Referência/);
  env.switchActor('student-b');
  await assert.rejects(env.media.deleteStoredMedia(ref, 'student-a'), /sessão mudou/);
  assert.equal(env.removeCalls.length, 2);
});

test('active schemes, inline HTML/SVG and unknown blobs never reach media elements or direct-open links', async () => {
  const env = setup();
  for (const source of ['javascript:alert(document.cookie)', 'java\nscript:alert(1)', 'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=',
    'blob:https://app.example.test/unknown', 'file:///private.txt', 'https://user:password@example.test/video.mp4']) {
    assert.equal(await env.media.resolveMediaUrl(source), '', source);
    assert.equal(await env.media.getCachedVideoBlobUrl(source), '', source);
  }
  assert.equal(env.fetchCalls.length, 0); assert.equal(env.created.length, 0);
  assert.equal(await env.media.resolveMediaUrl('data:image/jpeg;base64,aW1hZ2U='), 'data:image/jpeg;base64,aW1hZ2U=');
  assert.equal(await env.media.resolveMediaUrl('https://youtu.be/abcdefghijk'), 'https://youtu.be/abcdefghijk');
});

test('legacy supamedia cannot mint an application-origin HTML/SVG blob, but preserves GIF and video playback', async () => {
  for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml']) {
    const env = setup({ agenda: async () => ({ data: { notes: `data:${type};base64,PHNjcmlwdD5zdGVhbCgpPC9zY3JpcHQ+` } }) });
    assert.equal(await env.media.resolveMediaUrl('supamedia:attacker-record'), '');
    assert.equal(env.created.length, 0);
  }
  for (const type of ['image/gif', 'video/mp4']) {
    const env = setup({ agenda: async () => ({ data: { notes: `data:${type};base64,bWVkaWE=` } }) });
    assert.match(await env.media.resolveMediaUrl('supamedia:legacy-media'), /^blob:/);
    assert.equal(env.created[0].blob.type, type);
  }
});

test('local media belongs to its authenticated owner across logout and direct actor changes', async () => {
  const env = setup(), key = await env.media.storeLocalFile(new Blob(['private'], { type: 'image/jpeg' }), 'photo');
  assert.equal(env.localRecords.get(key.slice(4)).ownerId, 'student-a');
  env.state.actor = 'student-b'; // No clearMediaCache dependency may bypass the owner check.
  assert.equal(await env.media.resolveMediaUrl(key), '');
  assert.equal(await env.media.getLocalBlob(key), null);
  await assert.rejects(env.media.deleteLocalFile(key), /outra sessão/);
  env.switchActor(null);
  assert.equal(await env.media.resolveMediaUrl(key), '');
  await assert.rejects(env.media.storeLocalFile(new Blob(['unowned'])), /Entre na sua conta/);
  env.switchActor('student-a');
  assert.equal(await (await env.media.getLocalBlob(key)).text(), 'private');
});

test('ownerless legacy files stay quarantined unless the active account explicitly references them, without deleting pending media', async () => {
  const env = setup(), key = 'idb:legacy-photo';
  env.localRecords.set('legacy-photo', { blob: new Blob(['pending'], { type: 'image/jpeg' }) });
  env.state.caches.set('student-a:cadu_ponce_photos', [{ id: 'photo', localFileKey: key, syncStatus: 'pending' }]);
  env.switchActor('student-b'); assert.equal(await env.media.getLocalBlob(key), null);
  env.switchActor('student-a'); assert.equal(await (await env.media.getLocalBlob(key)).text(), 'pending');
  assert.equal(env.localRecords.size, 1); assert.equal(env.localDeletes.length, 0);
});

test('private media renews after focus/visibility return and never paints the previous actor URL', async () => {
  const slots = [], effects = []; let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = value; }]; },
    useEffect(callback, deps) { const index = cursor++, old = slots[index]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
      slots[index] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = callback(); });
    } },
  };
  const env = setup({ hooks }), reference = 'storage://evolution-photos/student-a/private.jpg';
  const render = () => { cursor = 0; const value = env.media.useMediaUrl(reference); effects.splice(0).forEach(effect => effect()); return value; };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(render(), ''); await settle();
    const first = render(); assert.match(first, /student-a/);
    assert.equal([...env.intervals.values()][0].delay, 9 * 60 * 1000);
    env.state.time += 9 * 60 * 1000; env.dispatch('focus'); await settle();
    const second = render(); assert.notEqual(second, first);
    env.state.time += 9 * 60 * 1000; env.dispatch('visibilitychange'); await settle();
    assert.notEqual(render(), second); assert.equal(env.signedCalls.length, 3);
    env.switchActor('student-b'); assert.equal(render(), '', 'the previous signed URL cannot paint while the next actor resolves');
    await settle(); assert.match(render(), /student-b/);
    assert.ok(env.signedCalls.every(call => call.seconds === 600));
  } finally { for (const slot of slots) slot?.cleanup?.(); }
  const count = env.signedCalls.length;
  env.state.time += 9 * 60 * 1000; env.dispatch('focus');
  assert.equal(env.signedCalls.length, count); assert.equal(env.intervals.size, 0);
});
