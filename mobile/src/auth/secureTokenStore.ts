import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'medly.refresh-token';

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  }
}

export async function clearRefreshToken(): Promise<void> {
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
}
