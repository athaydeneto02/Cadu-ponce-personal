export interface TrainerNotification {
  id: string;
  logId?: string;
  studentId?: string;
  studentName: string;
  studentPhone?: string;
  workoutTitle: string;
  duration?: string;
  timestamp?: string;
  fullDate: string;
  completedAt?: string;
  isRead: boolean;
  type: 'completion';
  detailMessage?: string;
}

export function uniqueNotifications(items: TrainerNotification[]): TrainerNotification[] {
  const byId = new Map<string, TrainerNotification>();
  for (const item of items) if (item?.id) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) =>
    (Date.parse(b.fullDate) || 0) - (Date.parse(a.fullDate) || 0) || a.id.localeCompare(b.id));
}

/** One request at a time; an event during a fetch schedules one fresh read. */
export function observeTrainerNotifications(options: {
  fetch: () => Promise<TrainerNotification[]>;
  onSnapshot: (items: TrainerNotification[]) => void;
  onNew: (items: TrainerNotification[]) => void;
  onError: (error: unknown) => void;
}) {
  let active = true;
  let initialized = false;
  let again = false;
  let running: Promise<void> | null = null;
  const seen = new Set<string>();
  const refresh = (): Promise<void> => {
    if (!active) return Promise.resolve();
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        try {
          const items = uniqueNotifications(await options.fetch());
          if (!active) return;
          const added = initialized ? items.filter(item => !seen.has(item.id) && !item.isRead && item.type === 'completion') : [];
          items.forEach(item => seen.add(item.id));
          initialized = true;
          options.onSnapshot(items);
          if (added.length) options.onNew(added);
        } catch (error) {
          if (active) options.onError(error);
        }
      } while (again && active);
    })().finally(() => { running = null; });
    return running;
  };
  return { refresh, stop: () => { active = false; again = false; } };
}
