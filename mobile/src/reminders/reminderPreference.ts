import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const REMINDERS_ENABLED_KEY = 'medly.reminders-enabled';

export async function getRemindersEnabled(): Promise<boolean> {
  const value =
    Platform.OS === 'web'
      ? window.localStorage.getItem(REMINDERS_ENABLED_KEY)
      : await SecureStore.getItemAsync(REMINDERS_ENABLED_KEY);
  return value === 'true';
}

export async function setRemindersEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    if (enabled) {
      window.localStorage.setItem(REMINDERS_ENABLED_KEY, 'true');
    } else {
      window.localStorage.removeItem(REMINDERS_ENABLED_KEY);
    }
    return;
  }
  if (enabled) {
    await SecureStore.setItemAsync(REMINDERS_ENABLED_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(REMINDERS_ENABLED_KEY);
  }
}
