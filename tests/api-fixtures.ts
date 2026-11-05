import { createECDH } from 'node:crypto';

export const fixtureUserId = 'a0000000-0000-4000-8000-000000000001';
export const fixtureOtherUserId = 'a0000000-0000-4000-8000-000000000002';
export const fixtureSessionId = 'b0000000-0000-4000-8000-000000000001';
// Not a valid signed token. Only authenticated-service test doubles accept it.
export function fixtureToken(sub = fixtureUserId, session_id: unknown = fixtureSessionId) {
  return `${Buffer.from('{"alg":"fixture-only"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub, session_id })).toString('base64url')}.fixture-not-a-signature`;
}
const ecdh = createECDH('prime256v1');
export const fixtureSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture-only',
  keys: { p256dh: ecdh.generateKeys().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') },
};
