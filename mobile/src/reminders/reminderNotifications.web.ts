import { UpcomingDose } from '../api/reminders';

const MAX_TIMEOUT = 2_147_000_000;
type PendingReminder = {
  dose: UpcomingDose;
  timer: ReturnType<typeof setTimeout>;
};

const pendingReminders = new Map<string, PendingReminder>();
let visibilityListenerRegistered = false;

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
  pendingReminders.forEach(({ timer }) => clearTimeout(timer));
  pendingReminders.clear();
}

function fireReminder(id: string): void {
  const reminder = pendingReminders.get(id);
  if (!reminder) {
    return;
  }
  clearTimeout(reminder.timer);
  pendingReminders.delete(id);
  if (Notification.permission !== 'granted') {
    return;
  }
  const notification = new Notification('Medication reminder', {
    body: 'A dose is scheduled now. Open Medly to review your schedule.',
    tag: id,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

function installVisibilityListener(): void {
  if (visibilityListenerRegistered) {
    return;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    const now = Date.now();
    pendingReminders.forEach(({ dose }, id) => {
      if (new Date(dose.scheduled_for).getTime() <= now) {
        fireReminder(id);
      }
    });
  });
  visibilityListenerRegistered = true;
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
  const scheduleReminder = (id: string, dose: UpcomingDose) => {
    const delay = new Date(dose.scheduled_for).getTime() - Date.now();
    const timer = setTimeout(
      () => {
        if (delay > MAX_TIMEOUT) {
          scheduleReminder(id, dose);
        } else {
          fireReminder(id);
        }
      },
      Math.min(Math.max(0, delay), MAX_TIMEOUT),
    );
    pendingReminders.set(id, { dose, timer });
  };

  upcoming.forEach((dose) => {
    const id = `${dose.schedule_id}:${dose.scheduled_for}`;
    scheduleReminder(id, dose);
  });
  installVisibilityListener();
  return upcoming.length;
}
