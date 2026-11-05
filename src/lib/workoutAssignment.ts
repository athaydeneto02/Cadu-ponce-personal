import type { AdminRoutine } from '../types';

/** Names and email addresses are display data, never assignment identifiers. */
export function routineMatchesUser(
  routine: Pick<AdminRoutine, 'studentIds'>,
  user: { uid?: string; id?: string } | null | undefined,
): boolean {
  const userId = user?.uid || user?.id;
  return !!userId && Array.isArray(routine.studentIds) && routine.studentIds.includes(userId);
}
