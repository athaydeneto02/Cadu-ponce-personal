import { useEffect, useRef, useState } from 'react';
import { elapsedWorkoutSeconds, type WorkoutClock } from './workoutDraft';

/** Count elapsed time, not interval ticks. Wall time covers suspended devices;
 * a monotonic floor prevents the visible timer from running backwards. */
export function useWorkoutClock(clock: WorkoutClock): number {
  const [seconds, setSeconds] = useState(() => elapsedWorkoutSeconds(clock));
  const floor = useRef(seconds);
  useEffect(() => {
    floor.current = elapsedWorkoutSeconds(clock);
    const monoStart = typeof performance !== 'undefined' ? performance.now() : 0;
    const initialElapsed = floor.current;
    const tick = () => {
      const monotonic = clock.runStartedAt !== null && typeof performance !== 'undefined'
        ? Math.floor(initialElapsed + Math.max(0, performance.now() - monoStart) / 1000) : initialElapsed;
      floor.current = elapsedWorkoutSeconds(clock, Date.now(), Math.max(floor.current, monotonic));
      setSeconds(floor.current);
    };
    tick();
    if (clock.runStartedAt === null) return;
    const timer = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [clock.elapsedSeconds, clock.runStartedAt]);
  return seconds;
}
