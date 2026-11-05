import type { WorkoutLog } from '../types';

/** Calendar keys follow the device's local day, including workouts near midnight. */
export function localWorkoutDateKey(value: Date | string): string | null {
  const dateOnly = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = value instanceof Date ? value : dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (dateOnly && (date.getMonth() + 1 !== Number(dateOnly[2]) || date.getDate() !== Number(dateOnly[3]))) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function workoutWeekDates(anchor: Date): Date[] {
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
}

export function completedWorkoutDates(logs: readonly WorkoutLog[], studentId?: string): Set<string> {
  const dates = new Set<string>();
  if (!studentId) return dates;
  for (const log of logs) {
    if (!log.id || log.studentId !== studentId || !log.completedAt) continue;
    const key = localWorkoutDateKey(log.completedAt);
    if (key) dates.add(key);
  }
  return dates;
}

export function workoutFrequencyRange(month: Date, weekAnchor: Date): { from: string; to: string } {
  const week = workoutWeekDates(weekAnchor);
  const nextMonday = new Date(week[0].getFullYear(), week[0].getMonth(), week[0].getDate() + 7);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return {
    from: new Date(Math.min(monthStart.getTime(), week[0].getTime())).toISOString(),
    to: new Date(Math.max(nextMonth.getTime(), nextMonday.getTime())).toISOString(),
  };
}

export function completedDaysInMonth(dates: ReadonlySet<string>, month: Date): Set<number> {
  const days = new Set<number>();
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
  for (const key of dates) if (key.startsWith(prefix)) days.add(Number(key.slice(-2)));
  return days;
}
