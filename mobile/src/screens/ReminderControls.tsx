import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { UpcomingDose } from '../api/reminders';
import {
  cancelLocalReminders,
  getReminderPermission,
  requestReminderPermission,
  scheduleLocalReminders,
} from '../reminders/reminderNotifications';
import {
  getRemindersEnabled,
  setRemindersEnabled,
} from '../reminders/reminderPreference';

export function ReminderControls({ doses }: { doses: UpcomingDose[] | null }) {
  const [permission, setPermission] = useState<
    'granted' | 'denied' | 'default' | 'unsupported' | null
  >(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledCount, setScheduledCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [currentPermission, savedPreference] = await Promise.all([
          getReminderPermission(),
          getRemindersEnabled(),
        ]);
        if (!cancelled) {
          setPermission(currentPermission);
          setEnabled(savedPreference && currentPermission === 'granted');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Reminder settings could not be loaded.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const refreshPermission = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void getReminderPermission()
        .then((currentPermission) => setPermission(currentPermission))
        .catch((permissionError: unknown) => {
          setError(
            permissionError instanceof Error
              ? permissionError.message
              : 'Browser notification permission could not be checked.',
          );
        });
    };
    document.addEventListener('visibilitychange', refreshPermission);
    return () => document.removeEventListener('visibilitychange', refreshPermission);
  }, []);

  useEffect(() => {
    if (permission === null || doses === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      if (!enabled || permission !== 'granted') {
        await cancelLocalReminders();
        if (!cancelled) {
          setScheduledCount(0);
        }
        return;
      }
      const count = await scheduleLocalReminders(doses);
      if (!cancelled) {
        setScheduledCount(count);
        setError(null);
      }
    })().catch((scheduleError: unknown) => {
      if (!cancelled) {
        setError(
          scheduleError instanceof Error
            ? scheduleError.message
            : 'Medication reminders could not be scheduled.',
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doses, enabled, permission]);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await cancelLocalReminders();
        await setRemindersEnabled(false);
        setEnabled(false);
        setScheduledCount(0);
        return;
      }

      const requestedPermission = await requestReminderPermission();
      setPermission(requestedPermission);
      if (requestedPermission !== 'granted') {
        await cancelLocalReminders();
        await setRemindersEnabled(false);
        setEnabled(false);
        setScheduledCount(0);
        setError(
          requestedPermission === 'unsupported'
            ? 'Notifications are unavailable in this browser or connection.'
            : 'Notification permission was not granted. Enable it in your device or browser settings to receive reminders.',
        );
        return;
      }
      await setRemindersEnabled(true);
      setEnabled(true);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Reminder settings could not be updated.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => void toggle()}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {busy ? 'Updating…' : enabled ? 'Reminders on' : 'Enable reminders'}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : permission === 'unsupported' ? (
        <Text style={styles.error}>
          Browser notifications need HTTPS or localhost and browser notification support.
        </Text>
      ) : enabled && scheduledCount === 0 ? (
        <Text style={styles.status}>
          No unreported confirmed doses in the next 30 days. Keep this tab open for reminders.
        </Text>
      ) : enabled ? (
        <Text style={styles.status}>
          {Platform.OS === 'web'
            ? 'Browser reminders need this tab open. A suspended tab may show them late.'
            : 'Reminders are scheduled for confirmed doses.'}
          {` ${scheduledCount} upcoming ${
            scheduledCount === 1 ? 'reminder' : 'reminders'
          } scheduled.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    maxWidth: 215,
  },
  button: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 9,
    borderWidth: 1,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  buttonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
  status: {
    color: '#1e3a8a',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'right',
  },
  error: {
    color: '#9f1239',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'right',
  },
});
