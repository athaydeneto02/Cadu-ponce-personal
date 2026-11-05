import test from 'node:test';
import assert from 'node:assert/strict';
import { getTestConfiguration } from '../scripts/test-environment.mjs';

const base = { TEST_SUPABASE_URL: 'http://127.0.0.1:54321', TEST_SUPABASE_ANON_KEY: 'fake-publishable-test-key', TEST_USER_EMAIL: 'test@example.invalid', TEST_USER_PASSWORD: 'not-a-real-password' };

test('manual diagnostics reject missing dedicated test credentials', () => {
  assert.throws(() => getTestConfiguration({ VITE_SUPABASE_URL: 'https://production.invalid' }));
});
test('localhost test project is accepted with dedicated variables', () => {
  assert.equal(getTestConfiguration(base).url, 'http://127.0.0.1:54321');
});
test('remote test project needs exact explicit allowed hostname', () => {
  const remote = { ...base, TEST_SUPABASE_URL: 'https://testing.invalid' };
  assert.throws(() => getTestConfiguration(remote));
  assert.equal(getTestConfiguration({ ...remote, TEST_ALLOWED_HOST: 'testing.invalid' }).url, 'https://testing.invalid');
});
test('explicit remote allow cannot override production exclusion', () => {
  const remote = { ...base, TEST_SUPABASE_URL: 'https://production.invalid', TEST_ALLOWED_HOST: 'production.invalid' };
  assert.throws(() => getTestConfiguration(remote, ['https://production.invalid']));
  assert.throws(() => getTestConfiguration({ ...remote, VITE_SUPABASE_URL: 'https://production.invalid' }));
});
test('writes are disabled unless explicitly configured for testing', () => {
  assert.throws(() => getTestConfiguration(base, [], { write: true }));
  assert.ok(getTestConfiguration({ ...base, TEST_ALLOW_WRITES: 'true' }, [], { write: true }));
});
test('privileged server keys are rejected by diagnostics', () => {
  assert.throws(() => getTestConfiguration({ ...base, TEST_SUPABASE_ANON_KEY: 'sb_secret_example' }));
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  assert.throws(() => getTestConfiguration({ ...base, TEST_SUPABASE_ANON_KEY: `header.${payload}.signature` }));
});
test('origins cannot contain credentials, query parameters, or paths', () => {
  for (const url of ['http://user:pass@localhost:54321', 'http://localhost:54321/?token=x', 'http://localhost:54321/rest']) {
    assert.throws(() => getTestConfiguration({ ...base, TEST_SUPABASE_URL: url }));
  }
});
