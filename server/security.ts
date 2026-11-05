import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function createServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'Serviço indisponível. Configure o servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function bearerToken(req: any): string {
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || !/^Bearer [^\s]+$/i.test(header)) {
    throw new HttpError(401, 'Entre na sua conta para continuar.');
  }
  return header.slice(7);
}

export async function requireAdmin(req: any, client: SupabaseClient) {
  const token = bearerToken(req);
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) throw new HttpError(401, 'Sessão inválida ou expirada.');
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
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    return ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com']
      .includes(url.hostname) || url.hostname.endsWith('.notify.windows.com') ||
      url.hostname.endsWith('.push.services.mozilla.com');
  } catch { return false; }
}
