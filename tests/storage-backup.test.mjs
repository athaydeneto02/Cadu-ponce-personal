import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportStorage, verifyStorage, restoreStorage, restoreConfiguration } from '../scripts/storage-backup.mjs';

const passphrase = 'fixture-only-passphrase-at-least-20';
const localEnv = { RESTORE_SUPABASE_URL: 'http://127.0.0.1:54321', RESTORE_SUPABASE_SERVICE_KEY: 'fixture-key', RESTORE_ALLOW_WRITES: 'true' };
function fakeStorage(initial = {}) {
  const buckets = new Map(Object.entries(initial).map(([id, objects]) => [id, { id, public: false, objects: new Map(Object.entries(objects)) }]));
  const calls = { uploads: 0, creates: 0, lists: [], downloads: 0 };
  return { buckets, calls, storage: {
    listBuckets: async ({ offset, limit }) => ({ data: [...buckets.values()].map(({ objects, ...bucket }) => bucket).sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + limit), error: null }),
    createBucket: async (id, settings) => { calls.creates++; buckets.set(id, { id, public: settings.public, objects: new Map() }); return { data: { name: id }, error: null }; },
    from: id => ({
      list: async (prefix, { offset, limit }) => {
        calls.lists.push({ id, prefix, offset });
        const rows = new Map();
        for (const [name, contents] of buckets.get(id).objects) {
          if (prefix && !name.startsWith(prefix + '/')) continue;
          const remainder = prefix ? name.slice(prefix.length + 1) : name;
          const child = remainder.split('/')[0];
          rows.set(child, remainder.includes('/') ? { name: child, id: null } : {
            name: child, id: 'id:' + name, updated_at: '2026-11-05T00:00:00Z', metadata: { size: Buffer.byteLength(contents), mimetype: 'text/plain' },
          });
        }
        return { data: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit), error: null };
      },
      download: async name => { calls.downloads++; const value = buckets.get(id)?.objects.get(name); return value === undefined ? { data: null, error: new Error('missing') } : { data: new Blob([value]), error: null }; },
      upload: async (name, bytes, options) => {
        calls.uploads++; assert.equal(options.upsert, false);
        if (buckets.get(id).objects.has(name)) return { error: new Error('duplicate') };
        buckets.get(id).objects.set(name, Buffer.from(bytes)); return { data: { path: name }, error: null };
      },
    }),
  } };
}
async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'cadu-backup-test-'));
  t.after(async () => { const resolved = path.resolve(parent); assert.ok(resolved.startsWith(path.join(path.resolve(os.tmpdir()), 'cadu-backup-test-'))); await rm(resolved, { recursive: true, force: true }); });
  const directory = path.join(parent, 'backup');
  const source = fakeStorage({ private: { 'student-a/photo.txt': 'PRIVATE-FIXTURE-CONTENT', 'student-a/notes.txt': 'fixture notes', 'other.txt': '' }, empty: {} });
  return { directory, source };
}
test('storage export is complete across folders/pages and encrypted, and verify needs no service credentials', async t => {
  const { directory, source } = await fixture(t);
  const summary = await exportStorage({ client: source, directory, sourceUrl: 'https://source.example.test', passphrase, pageSize: 1 });
  assert.equal(summary.objects, 3); assert.equal(summary.buckets, 2);
  assert.ok(source.calls.lists.some(call => call.prefix === 'student-a' && call.offset === 1));
  assert.equal(source.calls.uploads, 0); assert.equal(source.calls.creates, 0);
  assert.deepEqual(await verifyStorage({ directory, passphrase }), summary);
  assert.equal((await readFile(path.join(directory, 'manifest.enc'))).includes(Buffer.from('student-a')), false);
  for (const file of await readdir(path.join(directory, 'objects'))) assert.equal((await readFile(path.join(directory, 'objects', file))).includes(Buffer.from('PRIVATE-FIXTURE-CONTENT')), false);
  await assert.rejects(verifyStorage({ directory, passphrase: passphrase + '-wrong' }), /Senha incorreta/);
});
test('restore preflight writes nothing; local apply preserves bytes and retry skips identical objects', async t => {
  const { directory, source } = await fixture(t), target = fakeStorage();
  await exportStorage({ client: source, directory, sourceUrl: 'https://source.example.test', passphrase });
  const plan = await restoreStorage({ client: target, directory, passphrase, env: localEnv });
  assert.equal(plan.mode, 'preflight'); assert.equal(target.calls.uploads, 0); assert.equal(target.calls.creates, 0);
  const result = await restoreStorage({ client: target, directory, passphrase, env: localEnv, apply: true });
  assert.equal(result.mode, 'restored-and-verified'); assert.equal(result.writes, 3);
  assert.equal(target.buckets.get('private').objects.get('student-a/photo.txt').toString(), 'PRIVATE-FIXTURE-CONTENT');
  const retry = await restoreStorage({ client: target, directory, passphrase, env: localEnv, apply: true });
  assert.equal(retry.writes, 0); assert.equal(target.calls.uploads, 3);
});
test('restore rejects remote hosts, missing authorization, and collisions before any writes', async t => {
  assert.throws(() => restoreConfiguration({ ...localEnv, RESTORE_SUPABASE_URL: 'https://production.supabase.co' }, true), /só aceita/);
  assert.throws(() => restoreConfiguration({ ...localEnv, RESTORE_ALLOW_WRITES: '' }, true), /RESTORE_ALLOW_WRITES/);
  assert.throws(() => restoreConfiguration({ ...localEnv, RESTORE_SUPABASE_URL: 'http://localhost@production.supabase.co' }, true));
  const { directory, source } = await fixture(t);
  await exportStorage({ client: source, directory, sourceUrl: 'https://source.example.test', passphrase });
  const target = fakeStorage({ private: { 'student-a/photo.txt': 'existing different file' } });
  await assert.rejects(restoreStorage({ client: target, directory, passphrase, env: localEnv, apply: true }), /diferente/);
  assert.equal(target.calls.uploads, 0); assert.equal(target.calls.creates, 0);
});
test('missing/corrupt ciphertext prevents restore before mutations', async t => {
  const { directory, source } = await fixture(t);
  await exportStorage({ client: source, directory, sourceUrl: 'https://source.example.test', passphrase });
  const object = (await readdir(path.join(directory, 'objects')))[0];
  await writeFile(path.join(directory, 'objects', object), 'corrupted');
  const target = fakeStorage();
  await assert.rejects(restoreStorage({ client: target, directory, passphrase, env: localEnv, apply: true }), /corrompido/);
  assert.equal(target.calls.uploads, 0); assert.equal(target.calls.creates, 0);
});
test('failed source download never publishes a completed backup', async t => {
  const { directory, source } = await fixture(t);
  const original = source.storage.from;
  source.storage.from = id => ({ ...original(id), download: async () => ({ error: new Error('read failed') }) });
  await assert.rejects(exportStorage({ client: source, directory, sourceUrl: 'https://source.example.test', passphrase }));
  assert.equal(JSON.parse(await readFile(path.join(directory, 'backup.json'), 'utf8')).status, 'incomplete');
  await assert.rejects(verifyStorage({ directory, passphrase }), /incompleto/);
});
test('source changes during export make the backup incomplete', async t => {
  const { directory, source } = await fixture(t);
  const original = source.storage.from;
  source.storage.from = id => ({ ...original(id), download: async name => {
    const value = await original(id).download(name);
    source.buckets.get('private').objects.set('new-object.txt', 'arrived during export');
    return value;
  } });
  await assert.rejects(exportStorage({ client: source, directory, sourceUrl: 'https://source.example.test', passphrase }), /inventário mudou/);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'backup.json'), 'utf8')).status, 'incomplete');
});
test('backup directories inside the repository are refused before writing data', async () => {
  await assert.rejects(exportStorage({ client: fakeStorage(), directory: path.resolve('forbidden-backup-fixture'), sourceUrl: 'https://source.example.test', passphrase }), /dentro do repositório/);
});
