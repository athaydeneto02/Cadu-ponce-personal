import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Workbox runtime only: no workbox-build/Rollup plugin dependency chain.
export async function createPrecacheManifest(directory) {
  const files = [];
  async function walk(folder, relative = '') {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) { if (name === 'assets') await walk(path.join(folder, item.name), name); }
      else if ((name.startsWith('assets/') && /\.(js|css|png|jpe?g|webp|svg|woff2?)$/.test(name)) || ['index.html', 'icon.png', 'manifest.webmanifest', 'push-sw.js'].includes(name)) {
        const data = await readFile(path.join(directory, name));
        files.push({ url: `/${name}`, revision: createHash('sha256').update(data).digest('hex').slice(0,20) });
      }
    }
  }
  await walk(directory);
  if (!files.some(item => item.url === '/index.html')) throw new Error('PWA build requires index.html.');
  return files.sort((a, b) => a.url.localeCompare(b.url));
}

export async function buildServiceWorker(directory) {
  const entries = await createPrecacheManifest(directory);
  await build({
    stdin: { contents: `
      import { clientsClaim } from 'workbox-core';
      import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
      import { registerRoute, NavigationRoute } from 'workbox-routing';
      importScripts('/push-sw.js');
      clientsClaim();
      precacheAndRoute(${JSON.stringify(entries)});
      cleanupOutdatedCaches();
      registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\\/api(?:\\/|$)/] }));
      self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
    `, resolveDir: process.cwd(), sourcefile: 'generated-service-worker.js' },
    bundle: true, minify: true, platform: 'browser', format: 'iife', target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' }, outfile: path.join(directory, 'sw.js'),
  });
  await writeFile(path.join(directory, 'pwa-build.json'), JSON.stringify({ version: 1, entries }, null, 2));
}

/** @returns {import('vite').Plugin} */
export function appPwa() {
  return { name: 'cadu-pwa', apply: 'build', async closeBundle() { await buildServiceWorker(path.resolve('dist')); } };
}
