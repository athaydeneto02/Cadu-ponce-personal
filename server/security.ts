import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ECDH } from 'node:crypto';
import type { PushSubscription } from 'web-push';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function createServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'Serviço indisponível. Configure o servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      redirect: 'error',
    }) } });
}

export function bearerToken(req: any): string {
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || header.length > 8192 || !/^Bearer [^\s]+$/i.test(header)) {
    throw new HttpError(401, 'Entre na sua conta para continuar.');
  }
  return header.slice(7);
}

export async function requireAdmin(req: any, client: SupabaseClient) {
  const token = bearerToken(req);
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) throw new HttpError(401, 'Sessão inválida ou expirada.');
  await assertLiveSession(client, token, auth.user.id);
  const { data: profile, error } = await client.from('profiles')
    .select('id, role, status').eq('id', auth.user.id).single();
  if (error || profile?.role !== 'admin' || profile?.status !== 'active') {
    throw new HttpError(403, 'Esta operação exige um administrador ativo.');
  }
  return auth.user;
}

/** Persisted database limit works across cold starts and concurrent instances. */
export async function enforceRateLimit(client: SupabaseClient, userId: string, action: string) {
  const { data, error } = await client.rpc('consume_api_rate_limit', {
    p_user_id: userId, p_action: action,
  });
  if (error) throw new HttpError(503, 'Serviço temporariamente indisponível.');
  if (data !== true) throw new HttpError(429, 'Aguarde um minuto antes de tentar novamente.');
}

export function jsonBody(req: any): Record<string, unknown> {
  if (typeof req.body !== 'object' || !req.body || Array.isArray(req.body)) {
    throw new HttpError(400, 'Dados inválidos.');
  }
  if (Buffer.byteLength(JSON.stringify(req.body)) > 32_768) {
    throw new HttpError(413, 'Solicitação muito grande.');
  }
  return req.body;
}

export function relativeUrl(value: unknown, fallback: string): string {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) {
    throw new HttpError(400, 'O destino deve ser uma página deste aplicativo.');
  }
  const origin = 'https://app.invalid';
  const parsed = new URL(value, origin);
  if (parsed.origin !== origin) throw new HttpError(400, 'Destino inválido.');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function safeError(res: any, error: unknown) {
  const known = error instanceof HttpError;
  return res.status(known ? error.status : 500).json({
    error: known ? error.message : 'Não foi possível concluir a operação.',
  });
}

export function postOnly(req: any, res: any): boolean {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') return true;
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'Método não permitido.' });
  return false;
}

export function boundedText(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpError(400, `${label} inválido.`);
  }
  return value.trim();
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Call only after Auth.getUser(token) has verified this exact token remotely.
 * Decoding below selects a session; it never authenticates or authorizes roles. */
export async function assertLiveSession(client: SupabaseClient, verifiedToken: string, verifiedUserId: string) {
  let sessionId: string;
  try {
    const parts = verifiedToken.split('.');
    if (parts.length !== 3) throw new Error();
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (claims.sub !== verifiedUserId || !uuidPattern.test(verifiedUserId) || typeof claims.session_id !== 'string' || !uuidPattern.test(claims.session_id)) throw new Error();
    sessionId = claims.session_id;
  } catch { throw new HttpError(401, 'Sessão inválida ou expirada. Entre novamente.'); }
  const { data, error } = await client.rpc('server_has_valid_session', { p_user_id: verifiedUserId, p_session_id: sessionId });
  if (error) throw new HttpError(503, 'Não foi possível validar a sessão. Tente novamente.');
  if (data !== true) throw new HttpError(401, 'Sua sessão foi encerrada. Entre novamente.');
}

export function notificationInput(body: Record<string, unknown>) {
  if (!Array.isArray(body.userIds) || body.userIds.length < 1 || body.userIds.length > 100 ||
      body.userIds.some(id => typeof id !== 'string' || !uuidPattern.test(id))) {
    throw new HttpError(400, 'Selecione de 1 a 100 destinatários válidos.');
  }
  return {
    userIds: [...new Set(body.userIds as string[])],
    title: boundedText(body.title, 100, 'Título'),
    body: boundedText(body.body, 1000, 'Mensagem'),
    icon: relativeUrl(body.icon, '/icon.png'),
    url: relativeUrl(body.url, '/'),
  };
}

/** Subscriptions are client data: never send the server request to arbitrary hosts. */
export function allowedPushEndpoint(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    // The sender uses Node's legacy URL parser. Accept only canonical browser
    // subscription URLs so parser normalization cannot change the checked host.
    if (url.href !== value || url.hash || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    return ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com']
      .includes(url.hostname) || url.hostname.endsWith('.notify.windows.com') ||
      url.hostname.endsWith('.push.services.mozilla.com');
  } catch { return false; }
}

/** Browser-owned rows are untrusted even when read with a privileged client. */
export function validatedPushSubscription(value: unknown): PushSubscription | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const subscription = value as Record<string, unknown>;
  if (!allowedPushEndpoint(subscription.endpoint) || !subscription.keys || typeof subscription.keys !== 'object' || Array.isArray(subscription.keys)) return null;
  const keys = subscription.keys as Record<string, unknown>;
  const decode = (input: unknown, length: number): Buffer | null => {
    if (typeof input !== 'string' || input.length > 100 || !/^[A-Za-z0-9_-]+={0,2}$/.test(input)) return null;
    const bytes = Buffer.from(input, 'base64url');
    return bytes.length === length && bytes.toString('base64url') === input.replace(/=+$/, '') ? bytes : null;
  };
  const p256dh = decode(keys.p256dh, 65), auth = decode(keys.auth, 16);
  if (!p256dh || !auth || p256dh[0] !== 4) return null;
  try { ECDH.convertKey(p256dh, 'prime256v1'); } catch { return null; }
  return { endpoint: subscription.endpoint as string, keys: { p256dh: p256dh.toString('base64url'), auth: auth.toString('base64url') } };
}
