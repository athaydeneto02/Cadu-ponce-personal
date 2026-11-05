import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientErrorHandler } from '../server/clientError.ts';

test('client errors require active authentication, rate limits and strictly sanitized categories', async () => {
  let active = true, authenticated = true, limited = false, authCalls = 0;
  const events: unknown[] = [];
  const client: any = {
    auth: { async getUser() { authCalls++; return { data: { user: authenticated ? { id: 'private-id' } : null }, error: null }; } },
    from() { return { select() { return this; }, eq() { return this; }, async single() { return { data: { status: active ? 'active' : 'inactive' } }; } }; },
    async rpc(name: string, args: any) { assert.equal(name, 'consume_api_rate_limit'); assert.equal(args.p_action, 'client-error'); return { data: !limited }; },
  };
  const handler = createClientErrorHandler(() => client, event => events.push(event));
  async function request(body: any = { code: 'render' }, token = 'Bearer test', method = 'POST') {
    const res = { statusCode: 0, body: undefined as any, setHeader() {}, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; }, end() { return this; } };
    await handler({ method, body, headers: { authorization: token } }, res); return res;
  }
  assert.equal((await request(undefined, '')).statusCode, 401);
  assert.equal((await request({ code: 'render', message: 'private input' })).statusCode, 400);
  assert.equal((await request({ code: 'secret token' })).statusCode, 400);
  assert.equal(authCalls, 0);
  assert.equal((await request()).statusCode, 204);
  assert.deepEqual(events, [{ event: 'client_error', code: 'render' }]);
  limited = true; assert.equal((await request()).statusCode, 429);
  active = false; assert.equal((await request()).statusCode, 403);
  authenticated = false; assert.equal((await request()).statusCode, 401);
  assert.equal((await request(undefined, 'Bearer test', 'GET')).statusCode, 405);
  assert.equal(events.length, 1);
});
