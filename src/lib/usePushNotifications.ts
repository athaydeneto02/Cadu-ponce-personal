import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { getCacheUser } from './sessionCache';
import { ensurePushSubscription } from './pushSubscription';

type Status = 'idle' | 'syncing' | 'ready' | 'denied' | 'error' | 'unsupported';

/** Register this device only after the browser's existing or explicit permission. */
export async function registerPushForUser(userId: string, isCurrent: () => boolean, publicKey: string): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Recarregue o aplicativo para ativar as notificações.')), 15_000); }),
  ]).finally(() => clearTimeout(timeout));
  const result = await ensurePushSubscription({ manager: registration.pushManager, publicKey, permission: Notification.permission, isCurrent,
    persist: async (subscription, previousEndpoint) => {
      if (!isCurrent()) throw new Error('A sessão mudou.');
      const { data: existing, error: lookupError } = await supabase.from('push_subscriptions')
        .select('id').eq('user_id', userId).eq('subscription->>endpoint', previousEndpoint || subscription.endpoint).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      if (!isCurrent()) throw new Error('A sessão mudou.');
      const row = { user_id: userId, subscription: subscription.toJSON() };
      const { data, error } = existing
        ? await supabase.from('push_subscriptions').update(row).eq('id', existing.id).eq('user_id', userId).select('id').single()
        : await supabase.from('push_subscriptions').insert(row).select('id').single();
      if (error || !data?.id) throw new Error('Não foi possível ativar as notificações neste dispositivo.');
    },
  });
  if (result !== 'ready') throw new Error('Permita notificações nas configurações do navegador para receber os avisos.');
}

export function usePushNotifications(userId?: string) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const requestLock = useRef(false);

  useEffect(() => {
    let active = true;
    const isCurrent = () => active && !!userId && getCacheUser() === userId;
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!userId || !publicKey || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission !== 'granted') {
      setStatus(Notification.permission === 'denied' ? 'denied' : 'idle');
      return;
    }
    setStatus('syncing');
    setError('');
    void registerPushForUser(userId, isCurrent, publicKey).then(() => {
      if (isCurrent()) setStatus('ready');
    }).catch(failure => {
      if (isCurrent()) { setStatus('error'); setError(failure instanceof Error ? failure.message : 'Não foi possível ativar as notificações.'); }
    });
    return () => { active = false; };
  }, [userId, attempt]);

  const enable = async () => {
    if (requestLock.current || !userId || getCacheUser() !== userId || !('Notification' in window)) return;
    requestLock.current = true;
    try {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (getCacheUser() === userId) setAttempt(value => value + 1);
    } catch {
      if (getCacheUser() === userId) { setStatus('error'); setError('Não foi possível solicitar a permissão do navegador.'); }
    } finally { requestLock.current = false; }
  };
  return { status, enable, error };
}
