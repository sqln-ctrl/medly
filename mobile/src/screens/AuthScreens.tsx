import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthMode = 'login' | 'register';

type WelcomeScreenProps = {
  onLogin: () => void;
  onRegister: () => void;
};

type CredentialScreenProps = {
  mode: AuthMode;
  onBack: () => void;
  onSwitchMode: () => void;
  onSubmit: (email: string, password: string) => Promise<void>;
};

type StatusScreenProps = {
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  busy?: boolean;
};

export function WelcomeScreen({ onLogin, onRegister }: WelcomeScreenProps) {
  return (
    <ScreenFrame>
      <Text style={styles.eyebrow}>MEDLY</Text>
      <Text style={styles.title}>Medication tracking, made clearer.</Text>
      <Text style={styles.subtitle}>
        Keep your schedule and dose notes together. Medly is a reminder and tracking tool, not
        medical advice.
      </Text>
      <PrimaryButton label="Create an account" onPress={onRegister} />
      <SecondaryButton label="I already have an account" onPress={onLogin} />
      <Text style={styles.privacyNote}>Your account credentials are protected in transit.</Text>
    </ScreenFrame>
  );
}

export function CredentialScreen({
  mode,
  onBack,
  onSwitchMode,
  onSubmit,
}: CredentialScreenProps) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === 'register';

  const submit = async () => {
    if (busy) {
      return;
    }
    setError(null);
    if (isRegister && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (isRegister && password.length < 12) {
      setError('Use at least 12 characters for your password.');
      return;
    }
    try {
      setBusy(true);
      await onSubmit(email.trim(), password);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'The request could not be completed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenFrame>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>‹  Back</Text>
      </Pressable>
      <Text style={styles.eyebrow}>MEDLY ACCOUNT</Text>
      <Text style={styles.title}>{isRegister ? 'Create your account' : 'Welcome back'}</Text>
      <Text style={styles.subtitle}>
        {isRegister
          ? 'Use an email address and a password you can keep secure.'
          : 'Sign in to continue to your account.'}
      </Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!busy}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor="#94a3b8"
        returnKeyType="next"
        style={styles.input}
        textContentType="emailAddress"
        value={email}
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        editable={!busy}
        onChangeText={setPassword}
        onSubmitEditing={() => {
          if (!isRegister) {
            void submit();
          }
        }}
        placeholder={isRegister ? 'At least 12 characters' : 'Your password'}
        placeholderTextColor="#94a3b8"
        returnKeyType={isRegister ? 'next' : 'go'}
        secureTextEntry
        style={styles.input}
        textContentType={isRegister ? 'newPassword' : 'password'}
        value={password}
      />

      {isRegister ? (
        <>
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            autoCapitalize="none"
            editable={!busy}
            onChangeText={setConfirmPassword}
            onSubmitEditing={() => void submit()}
            placeholder="Enter your password again"
            placeholderTextColor="#94a3b8"
            returnKeyType="go"
            secureTextEntry
            style={styles.input}
            textContentType="newPassword"
            value={confirmPassword}
          />
        </>
      ) : null}

      {error ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <PrimaryButton
        disabled={busy || !email.trim() || !password}
        label={isRegister ? 'Create account' : 'Sign in'}
        loading={busy}
        onPress={() => void submit()}
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onSwitchMode}
        style={styles.switchButton}
      >
        <Text style={styles.switchText}>
          {isRegister ? 'Already have an account? Sign in' : 'New to Medly? Create an account'}
        </Text>
      </Pressable>
    </ScreenFrame>
  );
}

export function StatusScreen({
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  busy = false,
}: StatusScreenProps) {
  return (
    <ScreenFrame>
      <Text style={styles.eyebrow}>MEDLY</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{message}</Text>
      <PrimaryButton
        disabled={busy}
        label={primaryLabel}
        loading={busy}
        onPress={onPrimary}
      />
      {secondaryLabel && onSecondary ? (
        <SecondaryButton
          disabled={busy}
          label={secondaryLabel}
          onPress={onSecondary}
        />
      ) : null}
    </ScreenFrame>
  );
}

export function AuthenticatedScreen({
  email,
  busy,
  error,
  onSignOut,
}: {
  email: string;
  busy: boolean;
  error: string | null;
  onSignOut: () => void;
}) {
  return (
    <ScreenFrame>
      <Text style={styles.eyebrow}>MEDLY</Text>
      <Text style={styles.title}>You’re signed in.</Text>
      <Text style={styles.subtitle}>Account: {email}</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your account is ready</Text>
        <Text style={styles.cardText}>
          Medication tracking screens will be added in the next development slice.
        </Text>
      </View>
      {error ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <PrimaryButton
        disabled={busy}
        label="Sign out"
        loading={busy}
        onPress={onSignOut}
      />
    </ScreenFrame>
  );
}

function ScreenFrame({ children }: React.PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || pressed) && styles.primaryButtonMuted,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={styles.secondaryButton}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 28,
    paddingVertical: 8,
  },
  backText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
  eyebrow: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 39,
    marginBottom: 10,
  },
  subtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 26,
  },
  label: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 54,
    paddingHorizontal: 18,
  },
  primaryButtonMuted: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  switchButton: {
    alignItems: 'center',
    padding: 16,
  },
  switchText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  privacyNote: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 24,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 18,
    padding: 12,
  },
  errorText: {
    color: '#9f1239',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 12,
    padding: 20,
  },
  cardTitle: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  cardText: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
  },
});
