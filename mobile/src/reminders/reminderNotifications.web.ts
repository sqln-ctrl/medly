import { UpcomingDose } from '../api/reminders';

const MAX_TIMEOUT = 2_147_000_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function getReminderPermission(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (typeof Notification === 'undefined' || !window.isSecureContext) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestReminderPermission(): Promise<
  'granted' | 'denied' | 'default' | 'unsupported'
> {
  if (typeof Notification === 'undefined' || !window.isSecureContext) {
    return 'unsupported';
  }
  return Notification.requestPermission();
}

export async function cancelLocalReminders(): Promise<void> {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
}

export async function scheduleLocalReminders(doses: UpcomingDose[]): Promise<number> {
  await cancelLocalReminders();
  if (await getReminderPermission() !== 'granted') {
    return 0;
  }
  const upcoming = doses.filter(
    (dose) =>
      dose.status === null && new Date(dose.scheduled_for).getTime() > Date.now(),
  );
  upcoming.forEach((dose) => {
    const id = `${dose.schedule_id}:${dose.scheduled_for}`;
    const dueAt = new Date(dose.scheduled_for).getTime();
    const scheduleNext = () => {
      const delay = dueAt - Date.now();
      if (delay > MAX_TIMEOUT) {
        timers.set(id, setTimeout(scheduleNext, MAX_TIMEOUT));
        return;
      }
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          if (Notification.permission === 'granted') {
            new Notification('Medication reminder', {
              body: 'A dose is scheduled now. Open Medly to review your schedule.',
              tag: id,
            });
          }
        }, Math.max(0, delay)),
      );
    };
    scheduleNext();
  });
  return upcoming.length;
}
