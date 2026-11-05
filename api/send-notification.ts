import webpush from 'web-push';
import { createServerClient, HttpError } from '../server/security.js';
import { createNotificationHandler } from '../server/notifications.js';

export default createNotificationHandler({
  client: createServerClient,
  configurePush() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) {
      throw new HttpError(503, 'Notificações ainda não estão configuradas.');
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
  },
  send: (subscription, payload, timeout) => webpush.sendNotification(subscription, payload, { timeout, TTL: 3600 }),
});
