const origin = 'https://cadu-ponce-personal.vercel.app';
const get = url => fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'Cache-Control': 'no-cache' } });
const page = await get(origin + '/');
if (!page.ok) throw new Error(`Site unavailable: HTTP ${page.status}`);
const html = await page.text();
const entry = html.match(/src="(\/assets\/[^"/]+\.js)"/)?.[1];
if (!entry) throw new Error('Application entry missing.');
const resources = [entry, '/manifest.webmanifest', '/sw.js', '/push-sw.js', '/api/health'];
await Promise.all(resources.map(async resource => {
  const result = await get(origin + resource);
  if (!result.ok) throw new Error(`${resource}: HTTP ${result.status}`);
  if (resource === '/api/health' && (await result.json()).status !== 'ok') throw new Error('Database health check failed.');
}));
console.log('Site, application assets, PWA and database health: OK');
