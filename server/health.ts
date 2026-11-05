export function createHealthHandler(probe: () => Promise<void>) {
  return async (req: any, res: any) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error: 'Método não permitido.' });
    }
    try {
      await probe();
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
