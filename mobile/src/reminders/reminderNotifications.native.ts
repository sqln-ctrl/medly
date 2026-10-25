import * as Notifications from 'expo-notifications';

import { UpcomingDose } from '../api/reminders';

const REMINDER_CHANNEL_ID = 'medly-reminders';
const REMINDER_LIMIT = 50;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getReminderPermission(): Promise<
  'granted' | 'denied' | 'default' | 'unsupported'
> {
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.granted ? 'granted' : permissions.canAskAgain ? 'default' : 'denied';
}

export async function requestReminderPermission(): Promise<
  'granted' | 'denied' | 'default' | 'unsupported'
> {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Medication reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  const permissions = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: false,
    },
  });
  return permissions.granted ? 'granted' : permissions.canAskAgain ? 'default' : 'denied';
}

export async function cancelLocalReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.medlyReminder === true)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
}

export async function scheduleLocalReminders(doses: UpcomingDose[]): Promise<number> {
  await cancelLocalReminders();
  const upcoming = doses
    .filter(
      (dose) =>
        dose.status === null && new Date(dose.scheduled_for).getTime() > Date.now(),
    )
    .sort(
      (left, right) =>
        new Date(left.scheduled_for).getTime() - new Date(right.scheduled_for).getTime(),
    )
    .slice(0, REMINDER_LIMIT);

  await Promise.all(
    upcoming.map((dose) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Medication reminder',
          body: 'A dose is scheduled now. Open Medly to review your schedule.',
          data: { medlyReminder: true, scheduleId: dose.schedule_id },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(dose.scheduled_for),
          channelId: REMINDER_CHANNEL_ID,
        },
      }),
    ),
  );
  return upcoming.length;
}
