import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Get environment variables
const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY || 'BF4mz4GPAGZdcZi7EbNc1hHyI0bx_4npqhd0RV3aoHqSOpn9rjqpXUtA2SkNCPth1zgawRHMgFcVRmng0aVJQjQ';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'xHmkGsNMxT45l0dwxCgEdCO0v7PDwmNZb1784g-vYP8';
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''; // Fallback to anon key if service key not set

webpush.setVapidDetails(
  'mailto:support@cadu-ponce.com',
  vapidPublicKey,
  vapidPrivateKey
);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userIds, title, body, icon, url } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid userIds' });
    }

    // Fetch subscriptions for the given users
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ message: 'No active subscriptions found for these users.', sentCount: 0 });
    }

    const payload = JSON.stringify({
      title: title || 'Nova Notificação',
      body: body || 'Você tem uma nova mensagem!',
      icon: icon || '/pwa-icon.svg',
      url: url || '/'
    });

    let sentCount = 0;
    const errors: any[] = [];

    // Send push notifications in parallel
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          // Send push notification
          await webpush.sendNotification(sub.subscription, payload);
          sentCount++;
        } catch (err: any) {
          console.error(`Error sending push to subscription ${sub.id}:`, err);
          
          // If the subscription is expired or invalid, remove it from the database
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);
          } else {
            errors.push(err);
          }
        }
      })
    );

    return res.status(200).json({ 
      success: true, 
      message: `Notifications sent: ${sentCount}`,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
