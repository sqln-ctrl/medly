import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { AuthenticatedApp } from './src/screens/AuthenticatedApp';
import {
  CredentialScreen,
  StatusScreen,
  WelcomeScreen,
} from './src/screens/AuthScreens';

type AuthScreen = 'welcome' | 'login' | 'register';

function AppContent() {
  const {
    status,
    user,
    accessToken,
    sessionError,
    signIn,
    createAccount,
    signOut,
    retryRestore,
    startNewSession,
  } = useAuth();
  const [screen, setScreen] = useState<AuthScreen>('welcome');
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);

  const continueToLogin = async () => {
    setSessionActionError(null);
    try {
      await startNewSession();
      setScreen('login');
    } catch (error) {
      setSessionActionError(
        error instanceof Error ? error.message : 'The saved session could not be cleared.',
      );
    }
  };

  const handleSignOut = async () => {
    setSignOutBusy(true);
    setSignOutError(null);
    try {
      await signOut();
      setScreen('welcome');
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : 'Sign out could not be completed.',
      );
    } finally {
      setSignOutBusy(false);
    }
  };

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.stateScreen}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#1d4ed8" />
        <Text style={styles.loadingText}>Restoring your session…</Text>
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <StatusScreen
        title="Couldn't restore your session"
        message={
          sessionActionError ??
          sessionError ??
          'Check your connection and try again.'
        }
        primaryLabel="Try again"
        onPrimary={() => void retryRestore()}
        secondaryLabel="Sign in instead"
        onSecondary={() => void continueToLogin()}
      />
    );
  }

  if (status === 'expired') {
    return (
      <StatusScreen
        title="Your session expired"
        message={
          sessionActionError ??
          'Please sign in again to continue. Your account data remains on the server.'
        }
        primaryLabel="Sign in"
        onPrimary={() => void continueToLogin()}
      />
    );
  }

  if (status === 'authenticated' && user && accessToken) {
    return (
      <AuthenticatedApp
        accessToken={accessToken}
        busy={signOutBusy}
        email={user.email}
        error={signOutError}
        onSignOut={() => void handleSignOut()}
      />
    );
  }

  if (screen === 'login' || screen === 'register') {
    const mode = screen;
    return (
      <CredentialScreen
        mode={mode}
        onBack={() => setScreen('welcome')}
        onSwitchMode={() => setScreen(mode === 'login' ? 'register' : 'login')}
        onSubmit={mode === 'login' ? signIn : createAccount}
      />
    );
  }

  return (
    <WelcomeScreen
      onLogin={() => setScreen('login')}
      onRegister={() => setScreen('register')}
    />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  stateScreen: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#334155',
    fontSize: 16,
    marginTop: 16,
  },
});
