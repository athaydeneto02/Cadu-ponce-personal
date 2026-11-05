import type { SupabaseClient } from '@supabase/supabase-js';
import { bearerToken, enforceRateLimit, HttpError, jsonBody, postOnly, safeError } from './security.js';

const codes = new Set(['render', 'runtime', 'promise', 'asset']);
export function createClientErrorHandler(clientFactory: () => SupabaseClient, record: (event: { event: string; code: string }) => void) {
  return async (req: any, res: any) => {
    if (!postOnly(req, res)) return;
    try {
      const token = bearerToken(req);
      const body = jsonBody(req);
      if (Object.keys(body).length !== 1 || typeof body.code !== 'string' || !codes.has(body.code)) throw new HttpError(400, 'Código inválido.');
      const client = clientFactory();
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) throw new HttpError(401, 'Sessão inválida.');
      const { data: profile, error: profileError } = await client.from('profiles').select('status').eq('id', data.user.id).single();
      if (profileError || profile?.status !== 'active') throw new HttpError(403, 'Conta inativa.');
      await enforceRateLimit(client, data.user.id, 'client-error');
      // Fixed categories only: no messages, stack traces, identifiers or form data.
      record({ event: 'client_error', code: body.code });
      return res.status(204).end();
    } catch (error) { return safeError(res, error); }
  };
}
