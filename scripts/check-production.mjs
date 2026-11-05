const origin = 'https://cadu-ponce-personal.vercel.app';
const get = url => fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'Cache-Control': 'no-cache' } });
const page = await get(origin + '/');
if (!page.ok) throw new Error(`Site unavailable: HTTP ${page.status}`);
const policy = page.headers.get('content-security-policy') || '';
for (const requirement of ["script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'"]) {
  if (!policy.includes(requirement)) throw new Error(`Browser security policy missing: ${requirement}`);
}
if (page.headers.get('x-content-type-options') !== 'nosniff' || page.headers.get('referrer-policy') !== 'no-referrer') {
  throw new Error('Required privacy/security headers missing.');
}
const html = await page.text();
const entry = html.match(/src="(\/assets\/[^"/]+\.js)"/)?.[1];
if (!entry) throw new Error('Application entry missing.');
const resources = [entry, '/manifest.webmanifest', '/sw.js', '/push-sw.js', '/api/health'];
await Promise.all(resources.map(async resource => {
  const result = await get(origin + resource);
  if (!result.ok) throw new Error(`${resource}: HTTP ${result.status}`);
  if (resource === '/api/health' && (await result.json()).status !== 'ok') throw new Error('Database health check failed.');
}));
console.log('Site, application assets, PWA, database health and browser security headers: OK');
