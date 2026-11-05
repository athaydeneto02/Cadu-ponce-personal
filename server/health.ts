export function createHealthHandler(probe: () => Promise<void>, now: () => number = Date.now) {
  let running: Promise<boolean> | null = null;
  let expires = 0;
  let lastResult = false;
  const check = () => {
    if (now() < expires) return Promise.resolve(lastResult);
    if (running) return running;
    running = Promise.resolve().then(probe).then(() => true, () => false).then(healthy => {
      lastResult = healthy;
      // Also dampen retry storms during a database outage. This is instance-local;
      // public edge caching remains the first protection against distributed load.
      expires = now() + (healthy ? 30_000 : 5_000);
      return healthy;
    }).finally(() => { running = null; });
    return running;
  };
  return async (req: any, res: any) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error: 'Método não permitido.' });
    }
    try {
      if (!await check()) throw new Error('Unavailable');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).json({ status: 'ok' });
    } catch {
      // Do not expose credentials, student data or database internals.
      if (req.method === 'HEAD') return res.status(503).end();
      return res.status(503).json({ status: 'unavailable' });
    }
  };
}
