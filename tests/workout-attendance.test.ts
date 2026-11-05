import test from 'node:test';
import assert from 'node:assert/strict';
import { currentAttendanceRange, localDateKey, workoutAttendance } from '../src/lib/workoutAttendance';
import { WorkoutLog } from '../src/types';

process.env.TZ = 'America/Sao_Paulo';
const log = (id: string, completedAt: string, studentId = 'student-a', syncStatus: 'pending' | 'synced' = 'synced'): WorkoutLog => ({
  id, completedAt, studentId, studentName: studentId, routineId: 'routine', routineName: 'Treino', durationSeconds: 600, rpe: 5, exercisesSummary: [], syncStatus,
});

test('attendance uses the local day around midnight and counts each day and student only once', () => {
  const now = new Date('2026-11-05T23:45:00-03:00');
  const rows = [log('a', '2026-11-06T02:30:00Z'), log('b', '2026-11-05T18:00:00Z'), log('a', '2026-11-06T02:30:00Z'),
    log('c', '2026-11-05T18:00:00Z', 'student-b'), log('pending', '2026-11-04T18:00:00Z', 'student-a', 'pending'),
    log('future', '2026-11-07T18:00:00Z'), log('invalid', 'invalid-date')];
  assert.equal(localDateKey(rows[0].completedAt), '2026-11-05');
  const all = workoutAttendance(rows, now);
  assert.equal(all.monthLogs.length, 3);
  assert.equal(all.studentsToday, 2);
  assert.equal(all.completedDays, 1);
  const student = workoutAttendance(rows, now, 'student-a');
  assert.equal(student.monthLogs.length, 2);
  assert.equal(student.week[3].completed, true);
  assert.equal(student.week[2].completed, false);
});

test('the range includes the current week crossing a month boundary without inflating this month totals', () => {
  const now = new Date('2026-11-01T18:00:00-03:00');
  const range = currentAttendanceRange(now);
  assert.equal(localDateKey(range.startISO), '2026-10-26');
  assert.equal(localDateKey(range.endISO), '2026-12-01');
  const attendance = workoutAttendance([log('october', '2026-10-31T15:00:00Z'), log('november', '2026-11-01T15:00:00Z')], now);
  assert.equal(attendance.week[5].completed, true);
  assert.equal(attendance.week[6].completed, true);
  assert.equal(attendance.monthLogs.length, 1);
});

test('empty history has no invented presences or engagement', () => {
  const attendance = workoutAttendance([], new Date('2026-11-05T12:00:00-03:00'));
  assert.equal(attendance.studentsToday, 0);
  assert.equal(attendance.completedDays, 0);
  assert.equal(attendance.studentsThisMonth.size, 0);
  assert.ok(attendance.week.every(day => !day.completed));
});
