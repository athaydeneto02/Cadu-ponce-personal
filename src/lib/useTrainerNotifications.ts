import { useCallback, useEffect, useRef, useState } from 'react';
import { storage } from './storage';
import { supabase } from './supabase';
import { observeTrainerNotifications, TrainerNotification } from './trainerNotifications';

export function useTrainerNotifications(onNew: (items: TrainerNotification[]) => void) {
  const [items, setItems] = useState<TrainerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  const observerRef = useRef<ReturnType<typeof observeTrainerNotifications> | null>(null);
  const acknowledged = useRef(new Set<string>());
  const mounted = useRef(false);
  const actionRunning = useRef(false);
  const userId = storage.getUser()?.uid;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    mounted.current = true;
    setItems([]);
    setLoading(true);
    setError('');
    acknowledged.current.clear();
    const observer = observeTrainerNotifications({
      fetch: () => storage.fetchTrainerNotifications(),
      onSnapshot: notifications => {
        setItems(notifications.map(item => acknowledged.current.has(item.id) ? { ...item, isRead: true } : item));
        setLoading(false);
        setError('');
      },
      onNew: notifications => onNewRef.current(notifications.filter(item => !acknowledged.current.has(item.id))),
      onError: () => { setLoading(false); setError('Não foi possível atualizar as notificações. Tentaremos novamente ao conectar.'); },
    });
    observerRef.current = observer;
    const refresh = () => { void observer.refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const interval = setInterval(refresh, 10000);
    let channel: ReturnType<typeof supabase.channel> | undefined;
    try {
      channel = supabase.channel(`workout-completions-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_completion_notifications', filter: `recipient_id=eq.${userId}` }, refresh)
        .subscribe();
    } catch { /* Polling remains available if realtime is unavailable. */ }
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('cadu_new_notification', refresh);
    window.addEventListener('cadu_notifications_changed', refresh);
    document.addEventListener('visibilitychange', onVisible);
    refresh();
    return () => {
      mounted.current = false;
      observer.stop();
      observerRef.current = null;
      clearInterval(interval);
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('cadu_new_notification', refresh);
      window.removeEventListener('cadu_notifications_changed', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  const refresh = useCallback(() => observerRef.current?.refresh() ?? Promise.resolve(), []);
  const markRead = useCallback(async (ids: string[]) => {
    if (actionRunning.current || !ids.length) return;
    actionRunning.current = true;
    setBusy(true);
    setError('');
    try {
      // Update the local view only for individual writes confirmed by the server.
      for (const id of [...new Set(ids)]) {
        await storage.markTrainerNotificationRead(id);
        if (!mounted.current || storage.getUser()?.uid !== userId) return;
        acknowledged.current.add(id);
        setItems(previous => previous.map(item => item.id === id ? { ...item, isRead: true } : item));
      }
      await refresh();
    } catch (failure) {
      if (mounted.current) setError('Não foi possível marcar todas as notificações como lidas. As não confirmadas permanecem pendentes.');
      throw failure;
    } finally {
      actionRunning.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [refresh, userId]);
  return { items, loading, error, busy, refresh, markRead };
}
