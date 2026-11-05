import { useCallback, useEffect, useState } from 'react';
import { WorkoutLog } from '../types';
import { storage } from './storage';
import { currentAttendanceRange } from './workoutAttendance';

export function useWorkoutAttendance(notificationRevision: string) {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  const actor = storage.getUser()?.uid;
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const load = async () => {
      const request = ++sequence;
      const { startISO, endISO } = currentAttendanceRange();
      try {
        const data = await storage.fetchWorkoutLogsRange(startISO, endISO);
        if (!active || request !== sequence || storage.getUser()?.uid !== actor) return;
        setLogs(data);
        setError('');
      } catch {
        if (active && request === sequence) setError('Não foi possível atualizar a frequência. Tente novamente.');
      } finally { if (active && request === sequence) setLoading(false); }
    };
    const update = () => { void load(); };
    const onVisible = () => { if (document.visibilityState === 'visible') update(); };
    update();
    const interval = setInterval(update, 30000);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    window.addEventListener('cadu_data_synced', update);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      window.removeEventListener('cadu_data_synced', update);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actor, notificationRevision, attempt]);
  return { logs, loading, error, refresh };
}
