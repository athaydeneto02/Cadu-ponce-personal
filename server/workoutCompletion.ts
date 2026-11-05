import type { SupabaseClient } from '@supabase/supabase-js';
import { assertLiveSession, validatedPushSubscription, bearerToken, enforceRateLimit, HttpError, jsonBody,
  postOnly, safeError } from './security.js';

export function completionLogId(body: Record<string, unknown>): string {
  if (Object.keys(body).some(key => key !== 'logId') || typeof body.logId !== 'string' ||
      !body.logId.trim() || body.logId.length > 200 || /[\u0000-\u001f\u007f]/.test(body.logId)) {
    throw new HttpError(400, 'Informe somente o registro do treino concluído.');
  }
  return body.logId.trim();
}

interface CompletionDependencies {
  client: () => SupabaseClient;
  configurePush: () => void;
  send: (subscription: any, payload: string) => Promise<unknown>;
}

/** The inbox is already committed. Push is optional delivery, never its source. */
export function createWorkoutCompletionHandler(deps: CompletionDependencies) {
  return async (req: any, res: any) => {
    if (!postOnly(req, res)) return;
    try {
      const token = bearerToken(req);
      const logId = completionLogId(jsonBody(req));
      const client = deps.client();
      const { data: auth, error: authError } = await client.auth.getUser(token);
      if (authError || !auth.user) throw new HttpError(401, 'Sessão inválida ou expirada.');
      await assertLiveSession(client, token, auth.user.id);
      const { data: actor, error: actorError } = await client.from('profiles')
        .select('id,role,status').eq('id', auth.user.id).single();
      if (actorError || actor?.status !== 'active' || !['student', 'admin'].includes(actor.role)) {
        throw new HttpError(403, 'Esta operação exige uma conta ativa.');
      }
      // Bound failed ID probes too, and never query another student's log with
      // the privileged client. Missing and foreign IDs have the same response.
      await enforceRateLimit(client, actor.id, 'workout-completed');
      let logQuery = client.from('workout_logs').select('id,student_id').eq('id', logId);
      if (actor.role !== 'admin') logQuery = logQuery.eq('student_id', actor.id);
      const { data: log, error: logError } = await logQuery.maybeSingle();
      if (logError) throw new HttpError(503, 'Não foi possível consultar o treino.');
      if (!log) throw new HttpError(404, 'O registro do treino ainda não foi confirmado.');
      if (actor.role !== 'admin' && log.student_id !== actor.id) throw new HttpError(404, 'O registro do treino ainda não foi confirmado.');
      deps.configurePush();
      const { data: claim, error: claimError } = await client.rpc('claim_workout_completion_push', {
        p_log_id: logId, p_actor_id: actor.id,
      });
      if (claimError) throw new HttpError(503, 'Não foi possível preparar a notificação.');
      let sentCount = 0, failedCount = 0;
      let acknowledgementFailed = false;
      const deliveries: any[] = claim?.deliveries ?? [];
      for (let offset = 0; offset < deliveries.length; offset += 10) {
        await Promise.all(deliveries.slice(offset, offset + 10).map(async delivery => {
          let success = false;
          const subscription = validatedPushSubscription(delivery.subscription);
          let terminal = !subscription;
          if (subscription) {
            const payload = JSON.stringify({
              title: 'Treino concluído',
              body: `${String(delivery.student_name).slice(0, 120)} concluiu ${String(delivery.routine_name).slice(0, 120)}.`,
              icon: '/icon.png', url: '/?notifications=1', tag: `workout-completion:${delivery.notification_id}`,
              renotify: false,
            });
            try { await deps.send(subscription, payload); success = true; sentCount++; }
            catch (error: any) { terminal = error?.statusCode === 404 || error?.statusCode === 410; failedCount++; }
          } else failedCount++;
          const { data: finished, error } = await client.rpc('finish_workout_completion_push', {
            p_delivery_id: delivery.delivery_id, p_claim_token: delivery.claim_token,
            p_success: success, p_terminal: terminal,
          });
          if (error || finished !== true) acknowledgementFailed = true;
          // Keep terminal delivery records for dedupe; subscription rotation is
          // handled by registration and the regular notification endpoint.
        }));
      }
      const { data: pending, error: pendingError } = await client.rpc('workout_completion_push_pending', { p_log_id: logId });
      return res.status(200).json({ sentCount, failedCount, skippedCount: Number(claim?.skippedCount) || 0,
        pending: acknowledgementFailed || !!pendingError || pending === true });
    } catch (error) { return safeError(res, error); }
  };
}
