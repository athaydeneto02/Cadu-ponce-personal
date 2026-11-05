import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushSubscription } from 'web-push';
import { bearerToken, enforceRateLimit, HttpError, jsonBody, notificationInput, postOnly, requireAdmin, safeError, validatedPushSubscription } from './security.js';

interface Dependencies {
  client: () => SupabaseClient;
  configurePush: () => void;
  send: (subscription: PushSubscription, payload: string, timeout: number) => Promise<unknown>;
  now?: () => number;
}
export function createNotificationHandler(deps: Dependencies) {
  return async (req: any, res: any) => {
    if (!postOnly(req, res)) return;
    try {
      bearerToken(req);
      const client = deps.client();
      const admin = await requireAdmin(req, client);
      await enforceRateLimit(client, admin.id, 'notification');
      const input = notificationInput(jsonBody(req));
      deps.configurePush();
      const { data: recipients, error: recipientError } = await client.from('profiles')
        .select('id').in('id', input.userIds).eq('status', 'active');
      if (recipientError) throw new HttpError(503, 'Não foi possível consultar os destinatários.');
      const ids = (recipients || []).map(row => row.id);
      if (ids.length !== input.userIds.length) throw new HttpError(400, 'Há destinatários inexistentes ou inativos.');
      const { data: subscriptions, error } = await client.from('push_subscriptions')
        .select('id, subscription').in('user_id', ids).limit(501);
      if (error) throw new HttpError(503, 'Não foi possível consultar as notificações.');
      if ((subscriptions?.length || 0) > 500) throw new HttpError(400, 'Envie para um grupo menor de alunos.');
      const payload = JSON.stringify({ title: input.title, body: input.body, icon: input.icon, url: input.url });
      const now = deps.now || Date.now, deadline = now() + 20_000;
      let sentCount = 0, processed = 0;
      const errors: string[] = [];
      for (let offset = 0; offset < (subscriptions?.length || 0); offset += 10) {
        if (deadline - now() < 1000) break;
        await Promise.all(subscriptions!.slice(offset, offset + 10).map(async sub => {
          processed++;
          const subscription = validatedPushSubscription(sub.subscription);
          if (!subscription) { errors.push('Inscrição inválida.'); return; }
          try {
            await deps.send(subscription, payload, Math.max(1, Math.min(10_000, deadline - now())));
            sentCount++;
          } catch (failure: any) {
            errors.push('Não foi possível entregar uma notificação.');
            if (failure?.statusCode === 404 || failure?.statusCode === 410) {
              await client.from('push_subscriptions').delete().eq('id', sub.id);
            }
          }
        }));
      }
      const pendingCount = (subscriptions?.length || 0) - processed;
      if (pendingCount) errors.push('O limite de tempo foi atingido. Há notificações não enviadas; confira os destinatários antes de reenviar.');
      return res.status(200).json({ success: sentCount > 0 && errors.length === 0,
        sentCount, failedCount: errors.length - Number(pendingCount > 0) + pendingCount, pendingCount, errors });
    } catch (error) { return safeError(res, error); }
  };
}
