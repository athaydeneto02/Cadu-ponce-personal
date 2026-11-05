import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { secretKinds } from '../scripts/check-secrets.mjs';

test('production browser policy blocks injected scripts, remote connections and framing while retaining app media', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const headers = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers.map(header => [header.key.toLowerCase(), header.value]));
  const policy = Object.fromEntries(headers['content-security-policy'].split(';').map(s => s.trim().split(/\s+/)).filter(parts => parts[0]).map(([key, ...values]) => [key, values]));
  assert.deepEqual(policy['script-src'], ["'self'"]);
  for (const directive of ['script-src-attr', 'object-src', 'base-uri', 'frame-ancestors']) assert.deepEqual(policy[directive], ["'none'"]);
  assert.deepEqual(policy['form-action'], ["'self'"]);
  assert.deepEqual(policy['connect-src'], ["'self'", 'https://umqjakmxhfgclcxmpfda.supabase.co', 'wss://umqjakmxhfgclcxmpfda.supabase.co']);
  assert.ok(policy['frame-src'].includes('https://www.youtube.com'));
  assert.ok(policy['media-src'].includes('blob:'));
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(config.installCommand, 'npm ci');
  assert.equal(config.headers.find(rule => rule.source === '/api/(.*)').headers[0].value, 'no-store');
});

test('credential scanning distinguishes public configuration from privileged keys without reporting values', () => {
  const jwt = role => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';
  assert.deepEqual(secretKinds(jwt('anon')), []);
  assert.deepEqual(secretKinds('VAPID_PRIVATE_KEY=YOUR_NEW_VAPID_PRIVATE_KEY'), []);
  assert.deepEqual(secretKinds(jwt('service_role')), ['Privileged Supabase JWT']);
  for (const [prefix, suffix, kind] of [['sb' + 'p_', 'a'.repeat(40), 'Supabase management token'], ['sb_' + 'secret_', 'X'.repeat(40), 'Supabase secret key'], ['gh' + 'p_', 'X'.repeat(36), 'GitHub token']]) {
    assert.deepEqual(secretKinds(prefix + suffix), [kind]);
  }
  assert.deepEqual(secretKinds('VAPID_PRIVATE_KEY=' + 'x'.repeat(43)), ['Private VAPID key']);
});
