import { useEffect, useState } from 'react';
import type { WorkoutLog } from '../types';
import { storage } from './storage';
import { completedDaysInMonth, completedWorkoutDates, localWorkoutDateKey, workoutFrequencyRange, workoutWeekDates } from './workoutFrequency';

export function useWorkoutFrequency(studentId: string | undefined, month: Date, refreshKey: unknown, weekAnchor = new Date()) {
  const [state, setState] = useState<{ studentId?: string; logs: WorkoutLog[]; loading: boolean; error: string }>({ logs: [], loading: false, error: '' });
  const [currentDay, setCurrentDay] = useState(() => localWorkoutDateKey(new Date()));
  const { from, to } = workoutFrequencyRange(month, weekAnchor);

  useEffect(() => {
    let active = true;
    let request = 0;
    const actorId = storage.getUser()?.uid;
    const isCurrent = () => active && actorId === storage.getUser()?.uid;
    const refresh = () => {
      if (!isCurrent()) return;
      setCurrentDay(localWorkoutDateKey(new Date()));
      const requestId = ++request;
      const logs = storage.getWorkoutLogs().filter(log => log.studentId === studentId);
      setState({ studentId, logs, loading: Boolean(studentId), error: '' });
      if (!studentId) return;
      void storage.fetchWorkoutLogs(studentId, { from, to, allowCached: false }).then(fresh => {
        if (isCurrent() && requestId === request) setState({ studentId, logs: fresh, loading: false, error: '' });
      }).catch(() => {
        if (isCurrent() && requestId === request) setState({ studentId, logs: storage.getWorkoutLogs().filter(log => log.studentId === studentId), loading: false, error: 'Não foi possível atualizar a frequência. Exibindo os treinos salvos neste dispositivo.' });
      });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('cadu_workout_completed', refresh);
    window.addEventListener('cadu_data_synced', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    // Refresh at local midnight even when the dashboard stays open overnight.
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const midnightTimer = window.setTimeout(refresh, midnight.getTime() - now.getTime() + 100);
    return () => {
      active = false;
      window.clearTimeout(midnightTimer);
      window.removeEventListener('cadu_workout_completed', refresh);
      window.removeEventListener('cadu_data_synced', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [studentId, from, to, refreshKey, currentDay]);

  const logs = state.studentId === studentId ? state.logs : [];
  const dates = completedWorkoutDates(logs, studentId);
  const weekDates = workoutWeekDates(weekAnchor);
  return {
    dates,
    weekDates,
    weekCompletedDays: weekDates.map(day => dates.has(localWorkoutDateKey(day)!)),
    monthCompletedDays: completedDaysInMonth(dates, month),
    loading: state.studentId === studentId && state.loading,
    error: state.studentId === studentId ? state.error : '',
  };
}
