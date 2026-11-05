import webpush from 'web-push';
import { createServerClient, HttpError } from '../server/security.js';
import { createWorkoutCompletionHandler } from '../server/workoutCompletion.js';

export default createWorkoutCompletionHandler({
  client: createServerClient,
  configurePush() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) {
      throw new HttpError(503, 'As notificações externas ainda não estão configuradas.');
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
  },
  send: (subscription, payload) => webpush.sendNotification(subscription, payload, { timeout: 10_000, TTL: 3600 }),
});
