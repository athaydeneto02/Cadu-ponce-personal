import webpush from 'web-push';
import { allowedPushEndpoint, bearerToken, createServerClient, enforceRateLimit, HttpError,
  jsonBody, notificationInput, postOnly, requireAdmin, safeError } from '../server/security.js';

export default async function handler(req: any, res: any) {
  if (!postOnly(req, res)) return;
  try {
    bearerToken(req);
    const client = createServerClient();
    const admin = await requireAdmin(req, client);
    const input = notificationInput(jsonBody(req));
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) {
      throw new HttpError(503, 'Notificações ainda não estão configuradas.');
    }
    await enforceRateLimit(client, admin.id, 'notification');
    webpush.setVapidDetails(subject, publicKey, privateKey);
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
    let sentCount = 0;
    const errors: string[] = [];
    for (let offset = 0; offset < (subscriptions?.length || 0); offset += 10) {
      await Promise.all(subscriptions!.slice(offset, offset + 10).map(async sub => {
        if (!allowedPushEndpoint(sub.subscription?.endpoint)) {
          errors.push('Inscrição com destino inválido.');
          return;
        }
        try {
          await webpush.sendNotification(sub.subscription, payload, { timeout: 10_000, TTL: 3600 });
          sentCount++;
        } catch (err: any) {
          errors.push('Não foi possível entregar uma notificação.');
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await client.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }));
    }
    return res.status(200).json({ success: sentCount > 0 && errors.length === 0,
      sentCount, failedCount: errors.length, errors });
  } catch (error) { return safeError(res, error); }
}
