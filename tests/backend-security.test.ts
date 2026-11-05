import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedPushEndpoint, bearerToken, enforceRateLimit, HttpError, notificationInput,
  relativeUrl, requireAdmin } from '../server/security';
import upload, { matchesMediaType } from '../api/upload';
import sendNotification from '../api/send-notification';
import createUser, { newUserInput } from '../api/admin-create-user';

const userId = 'a0000000-0000-4000-8000-000000000001';
function authClient(role: string, status = 'active') {
  return { auth: { getUser: async () => ({ data: { user: { id: userId, user_metadata: { role: 'admin' } } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role, status }, error: null }) }) }) }) } as any;
}

test('JWT bearer is mandatory and must be a single token', () => {
  for (const authorization of [undefined, '', 'Basic aaa', 'Bearer', 'Bearer a b']) {
    assert.throws(() => bearerToken({ headers: { authorization } }), (err: any) => err.status === 401);
  }
  assert.equal(bearerToken({ headers: { authorization: 'Bearer token' } }), 'token');
});

test('real database role and active status are required, not user metadata', async () => {
  const req = { headers: { authorization: 'Bearer token' } };
  await assert.rejects(requireAdmin(req, authClient('student')), (err: any) => err.status === 403);
  await assert.rejects(requireAdmin(req, authClient('admin', 'inactive')), (err: any) => err.status === 403);
  assert.equal((await requireAdmin(req, authClient('admin'))).id, userId);
});

test('failed remote verification cannot authenticate a request', async () => {
  const client = authClient('admin');
  client.auth.getUser = async () => ({ data: { user: null }, error: new Error('expired') });
  await assert.rejects(requireAdmin({ headers: { authorization: 'Bearer stale' } }, client), (err: any) => err.status === 401);
});

test('notification URLs cannot leave the app or use protocol-relative paths', () => {
  for (const url of ['https://example.com', '//evil.example', '/\\evil.example', '/\nevil', 'javascript:alert(1)']) {
    assert.throws(() => relativeUrl(url, '/'), HttpError);
  }
  assert.equal(relativeUrl('/?tab=workouts', '/'), '/?tab=workouts');
});

test('push endpoint allowlist prevents SSRF and misleading hostnames', () => {
  for (const endpoint of ['https://127.0.0.1/a', 'http://fcm.googleapis.com/a',
    'https://fcm.googleapis.com.evil.example/a', 'https://fcm.googleapis.com:8080/a',
    'https://user:pass@fcm.googleapis.com/a']) assert.equal(allowedPushEndpoint(endpoint), false);
  assert.equal(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/test'), true);
  assert.equal(allowedPushEndpoint('https://web.push.apple.com/test'), true);
});

test('notification payload is bounded and recipients are deduplicated', () => {
  assert.deepEqual(notificationInput({ userIds: [userId, userId], title: 'Treino', body: 'Olá' }).userIds, [userId]);
  assert.throws(() => notificationInput({ userIds: [userId], title: 'x'.repeat(101), body: 'Olá' }), HttpError);
  assert.throws(() => notificationInput({ userIds: Array(101).fill(userId), title: 'Treino', body: 'Olá' }), HttpError);
});

test('rate limiter fails closed when missing, and enforces a denied request', async () => {
  await assert.rejects(enforceRateLimit({ rpc: async () => ({ error: new Error(), data: null }) } as any, userId, 'upload'), (e: any) => e.status === 503);
  await assert.rejects(enforceRateLimit({ rpc: async () => ({ error: null, data: false }) } as any, userId, 'upload'), (e: any) => e.status === 429);
});

test('media signatures reject HTML disguised as a video or image', () => {
  assert.equal(matchesMediaType(Buffer.from('<html>hello</html>'), 'image/jpeg'), false);
  assert.equal(matchesMediaType(Buffer.from([255, 216, 255, 224]), 'image/jpeg'), true);
  assert.equal(matchesMediaType(Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]), 'video/mp4'), true);
  assert.equal(matchesMediaType(Buffer.from('GIF89a'), 'image/gif'), true);
  assert.equal(matchesMediaType(Buffer.from('GIF87a'), 'image/gif'), true);
  assert.equal(matchesMediaType(Buffer.from('<html>GIF89a</html>'), 'image/gif'), false);
});

test('account creation has no default password and validates privileged inputs', () => {
  const base = { name: 'Aluno', email: 'aluno@example.com' };
  assert.throws(() => newUserInput(base), HttpError);
  assert.throws(() => newUserInput({ ...base, password: '123456' }), HttpError);
  assert.throws(() => newUserInput({ ...base, password: 'a long password', role: 'owner' }), HttpError);
  assert.equal(newUserInput({ ...base, password: 'a long password' }).role, 'student');
});

test('all deployed handlers reject anonymous requests without contacting a service', async () => {
  for (const handler of [upload, sendNotification, createUser]) {
    let statusCode = 0;
    const res = { setHeader() {}, status(code: number) { statusCode = code; return this; }, json(body: any) { return body; } };
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    assert.equal(statusCode, 401);
  }
});
