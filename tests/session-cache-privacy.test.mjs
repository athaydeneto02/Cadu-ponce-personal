import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup() {
  const disk = new Map(); let quotaBlocked = false;
  const localStorage = { getItem: key => disk.get(key) ?? null, removeItem: key => disk.delete(key),
    setItem: (key, value) => { if (quotaBlocked) throw Error('Quota exceeded'); disk.set(key, value); } };
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/sessionCache.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, localStorage };
  vm.runInNewContext(source, context);
  return { ...context.exports, disk, setQuotaBlocked: value => { quotaBlocked = value; } };
}

test('leaving an account removes only confirmed disposable snapshots and keeps pending work, drafts and quarantined data', () => {
  const api = setup(); api.setCacheUser('a'); const cache = api.cacheForUser('a');
  cache.setRemoteItem('cadu_ponce_users', JSON.stringify([{ name: 'Private student' }]));
  cache.setRemoteItem('cadu_ponce_user', JSON.stringify({ uid: 'a', name: 'Private profile' }));
  const pending = JSON.stringify([{ id: 'pending', syncStatus: 'pending', localFileKey: 'idb:private-file' }]);
  for (const key of ['cadu_workout_logs', 'cadu_ponce_photos', 'cadu_ponce_exercise_drafts', 'cadu_workout_session_r']) cache.setItem(key, pending);
  cache.setRemoteItem('other_pending', pending);
  cache.setItem('legacy_unverified', '["only local draft"]');
  api.disk.set('cadu:legacy:orphan', 'quarantined');
  api.setCacheUser('b');
  assert.equal(cache.getItem('cadu_ponce_users'), null); assert.equal(cache.getItem('cadu_ponce_user'), null);
  for (const key of ['cadu_workout_logs', 'cadu_ponce_photos', 'cadu_ponce_exercise_drafts', 'cadu_workout_session_r', 'other_pending']) assert.equal(cache.getItem(key), pending);
  assert.equal(cache.getItem('legacy_unverified'), '["only local draft"]');
  assert.equal(api.disk.get('cadu:legacy:orphan'), 'quarantined');
  assert.equal(api.cacheForUser('b').getItem('cadu_workout_logs'), null);
  assert.equal(cache.setRemoteItem('cadu_ponce_users', '["late response"]'), false);
  assert.equal(cache.getItem('cadu_ponce_users'), null);
});

test('logout clears in-memory remote fallbacks without removing another tab’s changed disk value', () => {
  const api = setup(); api.setCacheUser('a'); const cache = api.cacheForUser('a');
  cache.setRemoteItem('users', '["confirmed"]');
  api.disk.set('cadu:v2:a:users', '["edited by another tab"]');
  api.setQuotaBlocked(true); cache.setRemoteItem('private_report', '["memory only"]');
  assert.equal(cache.getItem('private_report'), '["memory only"]');
  api.setCacheUser(null);
  assert.equal(cache.getItem('private_report'), null);
  assert.equal(cache.getItem('users'), '["edited by another tab"]');
});
