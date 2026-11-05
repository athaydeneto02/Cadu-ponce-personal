import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePushSubscription } from '../src/lib/pushSubscription';

const keyBytes = (seed: number) => { const bytes = new Uint8Array(65).fill(seed); bytes[0] = 4; return bytes; };
const publicKey = Buffer.from(keyBytes(2)).toString('base64url');

function setup(oldKey: Uint8Array | null, { rejectPersist = false, removed = true } = {}) {
  const events: string[] = [];
  let current = true;
  let subscription: PushSubscription | null;
  const makeSubscription = (key: Uint8Array, endpoint: string) => ({
    endpoint, options: { applicationServerKey: key.buffer },
    unsubscribe: async () => { events.push('unsubscribe'); if (removed) subscription = null; return removed; },
    toJSON: () => ({ endpoint }),
  }) as unknown as PushSubscription;
  subscription = oldKey ? makeSubscription(oldKey, 'https://push.invalid/old') : null;
  const manager = {
    getSubscription: async () => subscription,
    subscribe: async () => { events.push('subscribe'); subscription = makeSubscription(keyBytes(2), 'https://push.invalid/new'); return subscription; },
  } as unknown as PushManager;
  return {
    events,
    stop: () => { current = false; },
    options: {
      manager, publicKey, permission: 'granted' as NotificationPermission,
      isCurrent: () => current,
      persist: async () => { events.push('persist'); if (rejectPersist) throw new Error('Database unavailable'); },
    },
  };
}

test('old VAPID subscription is removed before creating and saving the new one', async () => {
  const fixture = setup(keyBytes(1));
  assert.equal(await ensurePushSubscription(fixture.options), 'ready');
  assert.deepEqual(fixture.events, ['unsubscribe', 'subscribe', 'persist']);
});

test('matching VAPID subscription is reused and its persistence is confirmed', async () => {
  const fixture = setup(keyBytes(2));
  assert.equal(await ensurePushSubscription(fixture.options), 'ready');
  assert.deepEqual(fixture.events, ['persist']);
});

test('rotation never creates subscriptions without existing permission', async () => {
  for (const permission of ['default', 'denied'] as const) {
    const fixture = setup(keyBytes(1));
    const result = await ensurePushSubscription({ ...fixture.options, permission });
    assert.equal(result, permission === 'default' ? 'needs-permission' : 'denied');
    assert.deepEqual(fixture.events, []);
  }
});

test('failed persistence cannot report notifications ready', async () => {
  const fixture = setup(keyBytes(1), { rejectPersist: true });
  await assert.rejects(() => ensurePushSubscription(fixture.options), /Database unavailable/);
});

test('failed removal of an existing old key does not create a second subscription', async () => {
  const fixture = setup(keyBytes(1), { removed: false });
  await assert.rejects(() => ensurePushSubscription(fixture.options), /renovar/);
  assert.deepEqual(fixture.events, ['unsubscribe']);
});

test('an account change prevents stale subscription persistence', async () => {
  const fixture = setup(keyBytes(2));
  fixture.stop();
  await assert.rejects(() => ensurePushSubscription(fixture.options), /sessão/);
  assert.deepEqual(fixture.events, []);
});
