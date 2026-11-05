import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import { createPrecacheManifest, buildServiceWorker } from '../scripts/pwa-build.mjs';

test('PWA caches only versioned application assets, never user data, APIs or old workers', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'cadu-pwa-'));
  t.after(() => {
    assert.ok(path.resolve(folder).startsWith(path.join(path.resolve(tmpdir()), 'cadu-pwa-')));
    return rm(folder, { recursive: true, force: true });
  });
  await mkdir(path.join(folder, 'assets'));
  await mkdir(path.join(folder, 'api'));
  for (const [file, contents] of Object.entries({ 'index.html': '<html>test</html>', 'assets/app.js': 'window.app = true;', 'assets/app.css': 'body{}', 'api/users.json': '["private"]', 'sw.js': 'old-worker', '.env': 'secret', 'push-sw.js': 'self.addEventListener("push",()=>{});' })) await writeFile(path.join(folder, file), contents);
  const before = await createPrecacheManifest(folder);
  assert.deepEqual(before.map(item => item.url), ['/assets/app.css', '/assets/app.js', '/index.html', '/push-sw.js']);
  await writeFile(path.join(folder, 'assets/app.js'), 'window.app = "new";');
  const after = await createPrecacheManifest(folder);
  assert.notEqual(before.find(item => item.url.endsWith('app.js')).revision, after.find(item => item.url.endsWith('app.js')).revision);
  await buildServiceWorker(folder);
  const source = await readFile(path.join(folder, 'sw.js'), 'utf8');
  assert.doesNotThrow(() => new Script(source));
  assert.ok(source.includes('/push-sw.js'));
  assert.ok(source.includes('SKIP_WAITING'));
  assert.equal(source.includes('users.json'), false);
  assert.equal(source.includes('private'), false);
  const built = JSON.parse(await readFile(path.join(folder, 'pwa-build.json'), 'utf8'));
  assert.deepEqual(built.entries, after);
});
