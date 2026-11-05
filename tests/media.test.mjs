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
      path === './sessionCache' ? 'export const getCacheUser = () => globalThis.testState.actor;' :
      'export function useState() { throw new Error("React hooks are outside this test harness"); } export function useEffect() {}',
      loader: 'js',
    }));
  } }],
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup({ sign, agenda, localRead } = {}) {
  const state = { actor: 'student-a', time: 1_000_000 };
  const signedCalls = [];
  const agendaCalls = [];
  const localCalls = [];
  const created = [];
  const revoked = [];
  const fetchCalls = [];
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
    transaction() {
      return { objectStore() { return { get(id) {
        localCalls.push(id);
        const request = {};
        queueMicrotask(async () => {
          try {
            request.result = await (localRead ? localRead(id) : undefined);
            request.onsuccess?.();
          } catch (error) {
            request.error = error;
            request.onerror?.();
          }
        });
        return request;
      } }; } };
    },
  };
  const supabase = {
    storage: { from(bucket) { return { async createSignedUrl(path, seconds) {
      const call = { bucket, path, seconds, actor: state.actor };
      signedCalls.push(call);
      return sign ? sign(call) : { data: { signedUrl: `${projectOrigin}/signed/${state.actor}/${signedCalls.length}` }, error: null };
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
    module, exports: module.exports, testSupabase: supabase, testState: state,
    Date: Clock, URL: MediaURL, Blob, Uint8Array, atob,
    console: { log() {}, warn() {}, error() {} },
    window: { indexedDB: { open() {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    } } },
    fetch: async url => { fetchCalls.push(url); throw new Error('Network access is forbidden in this test'); },
    setTimeout, clearTimeout, setInterval, clearInterval,
  });
  const media = module.exports;
  return {
    media, state, signedCalls, agendaCalls, localCalls, created, revoked, fetchCalls,
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
  assert.deepEqual(signedCalls, [{ bucket: 'evolution-photos', path: 'student-a/foto de evolução.jpg', seconds: 3600, actor: 'student-a' }]);
});

test('a cached private URL is reused before forty minutes and renewed at expiration', async () => {
  const { media, state, signedCalls } = setup();
  const ref = 'storage://exercise-videos/trainer/video.mp4';
  const first = await media.resolveMediaUrl(ref);
  state.time += 40 * 60 * 1000 - 1;
  assert.equal(await media.resolveMediaUrl(ref), first);
  assert.equal(signedCalls.length, 1);
  state.time++;
  assert.notEqual(await media.resolveMediaUrl(ref), first);
  assert.equal(signedCalls.length, 2);
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
