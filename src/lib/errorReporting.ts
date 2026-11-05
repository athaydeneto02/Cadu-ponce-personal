import { supabase } from './supabase';

type ErrorCode = 'render' | 'runtime' | 'promise' | 'asset';
const sent = new Set<ErrorCode>();

/** A category is enough to detect failures, without collecting private input. */
export async function reportClientError(code: ErrorCode): Promise<void> {
  if (!import.meta.env.PROD || sent.has(code)) return;
  sent.add(code);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch('/api/client-error', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ code }), keepalive: true, signal: AbortSignal.timeout(5000),
    });
  } catch { /* Reporting must never interrupt the app or report its own failure. */ }
}

export function installErrorReporting(): void {
  window.addEventListener('error', () => { void reportClientError('runtime'); });
  window.addEventListener('unhandledrejection', () => { void reportClientError('promise'); });
  window.addEventListener('vite:preloadError', () => { void reportClientError('asset'); });
}
