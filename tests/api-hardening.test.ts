import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLiveSession, requireAdmin, validatedPushSubscription, allowedPushEndpoint } from '../server/security';
import { createNotificationHandler } from '../server/notifications';
import { createUploadHandler } from '../api/upload';
import { createHealthHandler } from '../server/health';
import { fixtureToken, fixtureUserId, fixtureOtherUserId, fixtureSessionId, fixtureSubscription } from './api-fixtures';

function response() {
  return { code: 0, body: undefined as any, headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; return this; }, end() { return this; } };
}
function clientFixture(options: any = {}) {
  const calls: any[] = [];
  const client: any = {
    auth: { getUser: async () => { calls.push('verify-token'); return { data: { user: options.invalidAuth ? null : { id: fixtureUserId } }, error: null }; } },
    rpc: async (name: string, args: unknown) => { calls.push({ rpc: name, args }); return { data: name === 'server_has_valid_session' ? !options.revoked : !options.limited, error: null }; },
    from(table: string) {
      calls.push({ table });
      let group = false;
      const query: any = {
        select() { return query; }, eq() { return query; }, in() { group = true; return query; }, delete() { calls.push('delete-subscription'); return query; },
        single: async () => ({ data: { id: fixtureUserId, role: options.role || 'admin', status: 'active' }, error: null }),
        limit: async () => ({ data: options.subscriptions || [], error: null }),
        then(resolve: any, reject: any) { return Promise.resolve({ data: group && table === 'profiles' ? [{ id: fixtureOtherUserId }] : [], error: null }).then(resolve, reject); },
      };
      return query;
    },
    storage: { from: (bucket: string) => ({
      upload: async (object: string, bytes: Buffer, settings: unknown) => { calls.push({ upload: { bucket, object, bytes: bytes.length, settings } }); return { error: null }; },
      createSignedUrl: async (object: string) => ({ data: { signedUrl: 'https://storage.example.test/' + object }, error: null }),
    }) },
  };
  return { client, calls };
}

test('live-session check binds decoded claims to the remotely verified user and fails closed', async () => {
  const seen: unknown[] = [];
  const client: any = { rpc: async (...args: unknown[]) => { seen.push(args); return { data: true, error: null }; } };
  for (const token of ['not-a-jwt', fixtureToken(fixtureOtherUserId), fixtureToken(fixtureUserId, null), fixtureToken(fixtureUserId, 'not-a-uuid')]) {
    await assert.rejects(assertLiveSession(client, token, fixtureUserId), (error: any) => error.status === 401);
  }
  assert.equal(seen.length, 0);
  await assertLiveSession(client, fixtureToken(), fixtureUserId);
  assert.deepEqual(seen, [['server_has_valid_session', { p_user_id: fixtureUserId, p_session_id: fixtureSessionId }]]);
  await assert.rejects(assertLiveSession({ rpc: async () => ({ data: false }) } as any, fixtureToken(), fixtureUserId), (error: any) => error.status === 401);
  await assert.rejects(assertLiveSession({ rpc: async () => ({ error: new Error('private database details') }) } as any, fixtureToken(), fixtureUserId), (error: any) => error.status === 503 && !error.message.includes('private'));
});

test('an invalid or revoked token cannot reach privileged profile queries', async () => {
  for (const options of [{ invalidAuth: true }, { revoked: true }]) {
    const { client, calls } = clientFixture(options);
    await assert.rejects(requireAdmin({ headers: { authorization: 'Bearer ' + fixtureToken() } }, client), (error: any) => error.status === 401);
    assert.equal(calls.some(call => call.table), false);
  }
});

test('push validation accepts real P-256 keys and strips untrusted properties', () => {
  const valid = validatedPushSubscription({ ...fixtureSubscription, arbitrary: { proxy: 'http://127.0.0.1' } });
  assert.deepEqual(valid, fixtureSubscription);
  for (const endpoint of ['https://fcm.googleapis.com/\npath', 'https://fcm.googleapis.com\\@127.0.0.1', 'https://fcm.googleapis.com/path#fragment', 'https://127.0.0.1/path', 'https://fcm.googleapis.com.evil.test/path', 'https://fcm.googleapis.com/' + 'a'.repeat(2048)]) {
    assert.equal(allowedPushEndpoint(endpoint), false);
    assert.equal(validatedPushSubscription({ ...fixtureSubscription, endpoint }), null);
  }
  for (const keys of [null, [], { ...fixtureSubscription.keys, auth: 'x' }, { ...fixtureSubscription.keys, p256dh: Buffer.alloc(65, 4).toString('base64url') }, { ...fixtureSubscription.keys, auth: '!'.repeat(22) }]) {
    assert.equal(validatedPushSubscription({ ...fixtureSubscription, keys }), null);
  }
});

test('notification API never sends invalid client subscriptions and does not disclose endpoints', async () => {
  const { client } = clientFixture({ subscriptions: [{ id: 'bad', subscription: { ...fixtureSubscription, endpoint: 'http://127.0.0.1/private' } }, { id: 'good', subscription: fixtureSubscription }] });
  const sends: unknown[] = [];
  const handler = createNotificationHandler({ client: () => client, configurePush() {}, send: async subscription => { sends.push(subscription); } });
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer ' + fixtureToken() }, body: { userIds: [fixtureOtherUserId], title: 'Treino', body: 'Mensagem fictícia' } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.sentCount, 1); assert.equal(res.body.failedCount, 1);
  assert.deepEqual(sends, [fixtureSubscription]); assert.equal(JSON.stringify(res.body).includes('127.0.0.1'), false);
});

test('notification batch has a bounded send window and reports unsent recipients honestly', async () => {
  const { client } = clientFixture({ subscriptions: Array.from({ length: 35 }, (_, index) => ({ id: String(index), subscription: fixtureSubscription })) });
  let time = 0;
  const timeouts: number[] = [];
  const handler = createNotificationHandler({ client: () => client, configurePush() {}, now: () => time,
    send: async (_subscription, _payload, timeout) => { timeouts.push(timeout); time = 21_000; } });
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer ' + fixtureToken() }, body: { userIds: [fixtureOtherUserId], title: 'Treino', body: 'Mensagem fictícia' } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.success, false); assert.equal(res.body.sentCount, 10);
  assert.equal(res.body.pendingCount, 25); assert.equal(res.body.failedCount, 25);
  assert.ok(timeouts.every(timeout => timeout > 0 && timeout <= 10_000));
});

test('upload validates the live admin session, actual streamed size and media type before storage writes', async () => {
  for (const [options, headers, chunks, expected] of [
    [{ revoked: true }, {}, [Buffer.from([255, 216, 255, 224])], 401],
    [{ role: 'student' }, {}, [Buffer.from([255, 216, 255, 224])], 403],
    [{}, {}, [Buffer.from('<html>not an image</html>')], 415],
    [{}, { 'content-length': String(5 * 1024 * 1024) }, [], 413],
    [{}, {}, [Buffer.alloc(3 * 1024 * 1024), Buffer.alloc(2 * 1024 * 1024)], 413],
  ] as const) {
    const { client, calls } = clientFixture(options);
    const req = { method: 'POST', headers: { authorization: 'Bearer ' + fixtureToken(), 'content-type': 'image/jpeg', ...headers }, async *[Symbol.asyncIterator]() { yield* chunks; } };
    const res = response(); await createUploadHandler(() => client)(req, res);
    assert.equal(res.code, expected); assert.equal(calls.some(call => call.upload), false);
  }
  const { client, calls } = clientFixture();
  const req = { method: 'POST', headers: { authorization: 'Bearer ' + fixtureToken(), 'content-type': 'image/jpeg', 'x-filename': '../../victim.html' }, async *[Symbol.asyncIterator]() { yield Buffer.from([255, 216, 255, 224]); } };
  const res = response(); await createUploadHandler(() => client)(req, res);
  assert.equal(res.code, 201);
  const uploaded = calls.find(call => call.upload).upload;
  assert.equal(uploaded.bucket, 'exercise-videos'); assert.match(uploaded.object, new RegExp('^' + fixtureUserId + '/[a-f0-9-]+\\.jpg$'));
});

test('health coalesces concurrent requests and dampens both healthy and failing probe storms', async () => {
  let calls = 0, time = 0, fail = false;
  const handler = createHealthHandler(async () => { calls++; if (fail) throw Error('private'); }, () => time);
  const results = Array.from({ length: 50 }, response);
  await Promise.all(results.map(res => handler({ method: 'GET' }, res)));
  assert.equal(calls, 1); assert.ok(results.every(res => res.code === 200));
  fail = true; time = 30_001;
  await Promise.all(Array.from({ length: 50 }, () => handler({ method: 'GET' }, response())));
  assert.equal(calls, 2);
  time += 4999; await handler({ method: 'GET' }, response()); assert.equal(calls, 2);
  time += 2; await handler({ method: 'HEAD' }, response()); assert.equal(calls, 3);
});
