import { WorkoutLog } from '../types';

export function localDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function currentAttendanceRange(now = new Date()): { startISO: string; endISO: string } {
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return { startISO: new Date(Math.min(month.getTime(), monday.getTime())).toISOString(), endISO: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString() };
}

export function workoutAttendance(logs: WorkoutLog[], now = new Date(), studentId?: string) {
  const unique = [...new Map(logs.filter(log => log.syncStatus !== 'pending' && (!studentId || log.studentId === studentId)
    && Number.isFinite(Date.parse(log.completedAt)) && Date.parse(log.completedAt) <= now.getTime()).map(log => [log.id, log])).values()]
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const monthPrefix = localDateKey(now).slice(0, 7);
  const monthLogs = unique.filter(log => localDateKey(log.completedAt).startsWith(monthPrefix));
  const days = new Set(unique.map(log => localDateKey(log.completedAt)));
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
    return { date, completed: days.has(localDateKey(date)) };
  });
  return {
    logs: unique, monthLogs, days, week,
    completedDays: new Set(monthLogs.map(log => localDateKey(log.completedAt))).size,
    studentsToday: new Set(unique.filter(log => localDateKey(log.completedAt) === localDateKey(now)).map(log => log.studentId)).size,
    studentsThisMonth: new Set(monthLogs.map(log => log.studentId)),
  };
}
