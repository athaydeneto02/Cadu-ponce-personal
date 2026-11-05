import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureToken, fixtureSubscription, fixtureUserId, fixtureOtherUserId } from './api-fixtures';
import { completionLogId, createWorkoutCompletionHandler } from '../server/workoutCompletion';

function harness(options: any = {}) {
  const calls: any[] = [], sends: any[] = [];
  const actor = { id: fixtureUserId, role: 'student', status: 'active', ...options.actor };
  const delivery = { delivery_id: 'delivery', claim_token: 'lease', notification_id: 'notification',
    subscription_id: 'subscription', subscription: options.subscription ?? fixtureSubscription,
    student_name: 'Aluno do banco', routine_name: 'Treino do banco' };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.invalidAuth ? null : { id: actor.id } }, error: null }) },
    from(table: string) {
      const query = { select() { return query; }, eq(column: string, value: string) { calls.push({ filter: column, value }); return query; },
        single: async () => ({ data: actor, error: null }),
        maybeSingle: async () => ({ data: options.missingLog ? null : { id: 'log-a', student_id: options.owner ?? fixtureUserId }, error: null }),
      };
      calls.push({ table });
      return query;
    },
    async rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === 'server_has_valid_session') return { data: !options.revokedSession, error: null };
      if (name === 'consume_api_rate_limit') return { data: !options.limited, error: null };
      if (name === 'claim_workout_completion_push') return { data: { deliveries: options.empty ? [] : [delivery], skippedCount: options.empty ? 1 : 0 }, error: null };
      if (name === 'finish_workout_completion_push') return { data: !options.ackFailure, error: null };
      if (name === 'workout_completion_push_pending') return { data: !!options.pending, error: null };
      throw new Error('Unexpected RPC');
    },
  };
  const handler = createWorkoutCompletionHandler({
    client: () => { calls.push({ createClient: true }); return client as any; },
    configurePush: () => { if (options.configFailure) throw new Error('Unavailable'); },
    send: async (subscription, payload) => {
      sends.push({ subscription, payload: JSON.parse(payload) });
      if (options.sendError) throw options.sendError;
    },
  });
  return { calls, sends, async request(body: any = { logId: 'log-a' }, authorization: string | undefined = 'Bearer ' + fixtureToken(actor.id)) {
    const response: any = { code: 0, body: null, setHeader() {}, status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; return value; } };
    await handler({ method: 'POST', headers: { authorization }, body }, response);
    return response;
  } };
}

test('completion accepts only a bounded log ID, never recipients or a message', () => {
  assert.equal(completionLogId({ logId: 'legacy-text-log' }), 'legacy-text-log');
  for (const body of [{ logId: '' }, { logId: 'x'.repeat(201) }, { logId: 'a\nb' },
    { logId: 'log', title: 'fake' }, { logId: 'log', userIds: ['someone'] }]) assert.throws(() => completionLogId(body));
});

test('anonymous and unauthorized owners cannot claim or send a completion push', async () => {
  const anonymous = harness();
  assert.equal((await anonymous.request({ logId: 'log-a' }, '')).code, 401);
  assert.equal(anonymous.calls.length, 0);
  for (const [options, code] of [
    [{ invalidAuth: true },401], [{ actor: { status: 'inactive' } },403],
    [{ owner: fixtureOtherUserId },404], [{ missingLog: true },404], [{ revokedSession: true },401],
  ] as const) {
    const h = harness(options);
    assert.equal((await h.request()).code, code);
    assert.equal(h.sends.length, 0);
    assert.equal(h.calls.some(call => call.name === 'claim_workout_completion_push'), false);
  }
});

test('owner completion uses only server snapshots and acknowledges its specific lease', async () => {
  const h = harness();
  const response = await h.request();
  assert.deepEqual(response.body, { sentCount: 1, failedCount: 0, skippedCount: 0, pending: false });
  assert.equal(h.sends[0].payload.title, 'Treino concluído');
  assert.equal(h.sends[0].payload.body, 'Aluno do banco concluiu Treino do banco.');
  assert.equal(h.sends[0].payload.tag, 'workout-completion:notification');
  assert.equal(h.sends[0].payload.url, '/?notifications=1');
  assert.equal(h.sends[0].payload.renotify, false);
  assert.deepEqual(h.calls.find(call => call.name === 'finish_workout_completion_push').args,
    { p_delivery_id: 'delivery', p_claim_token: 'lease', p_success: true, p_terminal: false });
});

test('active administrators may request delivery and duplicate/no-subscription claims do not resend', async () => {
  const h = harness({ actor: { id: fixtureOtherUserId, role: 'admin' }, empty: true });
  const response = await h.request();
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { sentCount: 0, failedCount: 0, skippedCount: 1, pending: false });
  assert.equal(h.sends.length, 0);
});

test('transient delivery or acknowledgement failures request a retry without erasing completion', async () => {
  for (const options of [{ sendError: new Error('temporary'), pending: true }, { ackFailure: true }]) {
    const h = harness(options);
    const response = await h.request();
    assert.equal(response.code, 200);
    assert.equal(response.body.pending, true);
    assert.equal(h.calls.some(call => call.table === 'workout_logs' && call.operation === 'delete'), false);
  }
});

test('expired push subscriptions terminate delivery without endless retry', async () => {
  const h = harness({ sendError: { statusCode: 410 } });
  const response = await h.request();
  assert.equal(response.body.pending, false);
  assert.equal(response.body.failedCount, 1);
  assert.equal(h.calls.find(call => call.name === 'finish_workout_completion_push').args.p_terminal, true);
});

test('missing and foreign log probes consume the limit before lookup and use the owner filter', async () => {
  for (const options of [{ missingLog: true }, { owner: fixtureOtherUserId }]) {
    const h = harness(options);
    assert.equal((await h.request()).code, 404);
    const rate = h.calls.findIndex(call => call.name === 'consume_api_rate_limit');
    const lookup = h.calls.findIndex(call => call.table === 'workout_logs');
    assert.ok(rate >= 0 && rate < lookup);
    assert.ok(h.calls.some(call => call.filter === 'student_id' && call.value === fixtureUserId));
  }
  const limited = harness({ limited: true });
  assert.equal((await limited.request()).code, 429);
  assert.equal(limited.calls.some(call => call.table === 'workout_logs'), false);
});

test('malformed encryption keys never reach a push provider and are terminal', async () => {
  const h = harness({ subscription: { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'invalid', auth: 'invalid' } } });
  const result = await h.request();
  assert.equal(result.code, 200); assert.equal(result.body.failedCount, 1); assert.equal(h.sends.length, 0);
  assert.equal(h.calls.find(call => call.name === 'finish_workout_completion_push').args.p_terminal, true);
});
