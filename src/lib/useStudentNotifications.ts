import { useCallback, useEffect, useRef, useState } from 'react';
import { storage } from './storage';
import { supabase } from './supabase';
import type { StudentNotification } from '../types';

export function useStudentNotifications(userId: string) {
  const [items, setItems] = useState<StudentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<{ refresh: () => Promise<void>; current: () => boolean } | null>(null);
  const acknowledged = useRef(new Set<string>());
  const writing = useRef(false);

  useEffect(() => {
    let active = true;
    let running: Promise<void> | null = null;
    let queued = false;
    const current = () => active && storage.getUser()?.uid === userId;
    acknowledged.current.clear();
    setItems([]); setError(''); setLoading(true);
    const refresh = (): Promise<void> => {
      queued = true;
      if (running) return running;
      running = (async () => {
        while (queued && current()) {
          queued = false;
          try {
            const rows = await storage.fetchStudentNotifications(userId);
            if (!current()) return;
            setItems(rows.map(row => acknowledged.current.has(row.id) ? { ...row, readAt: row.readAt || new Date().toISOString() } : row));
            setError('');
          } catch {
            if (current()) setError('Não foi possível atualizar seus avisos. Verifique a conexão e tente novamente.');
          } finally { if (current()) setLoading(false); }
        }
      })().finally(() => { running = null; });
      return running;
    };
    controller.current = { refresh, current };
    const onRefresh = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') onRefresh(); };
    const timer = setInterval(onRefresh, 30_000);
    let channel: ReturnType<typeof supabase.channel> | undefined;
    try {
      channel = supabase.channel(`student-inbox-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_notifications', filter: `recipient_id=eq.${userId}` }, onRefresh)
        .subscribe();
    } catch { /* Focus/reconnect/polling still refresh the inbox. */ }
    window.addEventListener('online', onRefresh);
    window.addEventListener('focus', onRefresh);
    window.addEventListener('cadu_student_notifications_changed', onRefresh);
    document.addEventListener('visibilitychange', onVisible);
    onRefresh();
    return () => {
      active = false; controller.current = null;
      clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener('online', onRefresh);
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('cadu_student_notifications_changed', onRefresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  const refresh = useCallback(() => controller.current?.refresh() ?? Promise.resolve(), []);
  const markRead = useCallback(async (ids: string[]) => {
    const currentController = controller.current;
    if (writing.current || !currentController?.current()) return;
    writing.current = true; setBusy(true); setError('');
    try {
      for (const id of new Set(ids)) {
        if (!currentController.current()) return;
        await storage.markStudentNotificationRead(id);
        if (!currentController.current()) return;
        acknowledged.current.add(id);
        setItems(previous => previous.map(item => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
      }
    } catch {
      if (currentController.current()) setError('Não foi possível confirmar a leitura. Os avisos não confirmados continuam pendentes.');
    } finally {
      writing.current = false;
      if (currentController.current()) setBusy(false);
    }
  }, []);
  return { items, loading, error, busy, refresh, markRead };
}
