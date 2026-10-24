import React, { useCallback, useEffect, useState } from 'react';
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
import {
  createMedication as createMedicationRequest,
  listMedications,
  Medication,
} from '../api/medications';

type AuthenticatedAppProps = {
  accessToken: string;
  email: string;
  busy: boolean;
  error: string | null;
  onSignOut: () => void;
};

type Tab = 'today' | 'medications';

export function AuthenticatedApp({
  accessToken,
  email,
  busy,
  error,
  onSignOut,
}: AuthenticatedAppProps) {
  const [tab, setTab] = useState<Tab>('today');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [addingMedication, setAddingMedication] = useState(false);
  const [loadingMedications, setLoadingMedications] = useState(true);
  const [medicationError, setMedicationError] = useState<string | null>(null);
  const [savingMedication, setSavingMedication] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadingMedications(true);
    setMedicationError(null);
    void listMedications(accessToken)
      .then((result) => {
        if (!cancelled) {
          setMedications(result);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setMedicationError(
            loadError instanceof Error
              ? loadError.message
              : 'Medications could not be loaded. Please try again.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMedications(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, reloadKey]);

  const addMedication = useCallback(
    async (name: string, instructions: string) => {
      setSavingMedication(true);
      try {
        const medication = await createMedicationRequest(accessToken, name, instructions);
        setMedications((current) => [medication, ...current]);
        setAddingMedication(false);
      } finally {
        setSavingMedication(false);
      }
    },
    [accessToken],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appFrame}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>MEDLY</Text>
            <Text style={styles.accountLabel} numberOfLines={1}>{email}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onSignOut}
            style={styles.signOutButton}
          >
            <Text style={styles.signOutText}>{busy ? 'Signing out…' : 'Sign out'}</Text>
          </Pressable>
        </View>

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.content}>
          {addingMedication ? (
            <MedicationForm
              onCancel={() => setAddingMedication(false)}
              onSave={addMedication}
              saving={savingMedication}
            />
          ) : tab === 'today' ? (
            <TodayScreen
              medicationCount={medications.length}
              loading={loadingMedications}
              error={medicationError}
              onRetry={() => setReloadKey((current) => current + 1)}
              onViewMedications={() => setTab('medications')}
            />
          ) : (
            <MedicationsScreen
              medications={medications}
              error={medicationError}
              loading={loadingMedications}
              onRetry={() => setReloadKey((current) => current + 1)}
              onAdd={() => setAddingMedication(true)}
            />
          )}
        </View>

        {!addingMedication ? (
          <View accessibilityRole="tablist" style={styles.tabBar}>
            <TabButton
              label="Today"
              selected={tab === 'today'}
              onPress={() => setTab('today')}
            />
            <TabButton
              label="Medications"
              selected={tab === 'medications'}
              onPress={() => setTab('medications')}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function TodayScreen({
  medicationCount,
  loading,
  error,
  onRetry,
  onViewMedications,
}: {
  medicationCount: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onViewMedications: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.pageEyebrow}>YOUR DAY</Text>
      <Text style={styles.pageTitle}>Today</Text>
      <Text style={styles.pageSubtitle}>A clear place to keep track of your medication routine.</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryTopLine}>
          <Text style={styles.cardTitle}>Today’s schedule</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>Not set up</Text>
          </View>
        </View>
        <Text style={styles.cardBody}>
          {medicationCount === 0
            ? 'Your schedule will appear here after you add medications and confirm a schedule.'
            : 'Medication schedules are set up separately. Adding a medication does not create reminders.'}
        </Text>
        <Text style={styles.neutralNote}>
          Reminders only start after you review and confirm a schedule.
        </Text>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Your medications</Text>
        <Text style={styles.countText}>{medicationCount}</Text>
      </View>
      {loading ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color="#1d4ed8" />
          <Text style={[styles.cardBody, styles.loadingMessage]}>Loading your medications…</Text>
        </View>
      ) : error ? (
        <View accessibilityRole="alert" style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Medications couldn’t be loaded</Text>
          <Text style={styles.cardBody}>{error}</Text>
          <ActionButton label="Try again" onPress={onRetry} />
        </View>
      ) : medicationCount === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing added yet</Text>
          <Text style={styles.cardBody}>
            Add medication details to keep them together in one place.
          </Text>
          <ActionButton label="View medications" onPress={onViewMedications} />
        </View>
      ) : (
        <View style={styles.infoCard}>
          <Text style={styles.cardBody}>
            {medicationCount} {medicationCount === 1 ? 'medication' : 'medications'} saved to your account.
          </Text>
          <ActionButton label="View medications" onPress={onViewMedications} />
        </View>
      )}
    </ScrollView>
  );
}

function MedicationsScreen({
  medications,
  error,
  loading,
  onRetry,
  onAdd,
}: {
  medications: Medication[];
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  onAdd: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.pageEyebrow}>YOUR LIST</Text>
      <Text style={styles.pageTitle}>Medications</Text>
      <Text style={styles.pageSubtitle}>
        Keep medication details and instructions together.
      </Text>

      <ActionButton label="＋  Add medication" disabled={loading || Boolean(error)} onPress={onAdd} />

      {loading ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color="#1d4ed8" />
          <Text style={[styles.cardBody, styles.loadingMessage]}>Loading your medications…</Text>
        </View>
      ) : error ? (
        <View accessibilityRole="alert" style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Medications couldn’t be loaded</Text>
          <Text style={styles.cardBody}>{error}</Text>
          <ActionButton label="Try again" onPress={onRetry} />
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No medications yet</Text>
          <Text style={styles.cardBody}>
            Medication details you add will appear here and be saved to your account.
          </Text>
        </View>
      ) : (
        <View style={styles.medicationList}>
          {medications.map((medication) => (
            <View key={medication.id} style={styles.medicationCard}>
              <View style={styles.medicationIcon}>
                <Text style={styles.medicationIconText}>M</Text>
              </View>
              <View style={styles.medicationDetails}>
                <Text style={styles.medicationName}>{medication.name}</Text>
                <Text style={styles.instructionLabel}>INSTRUCTIONS</Text>
                <Text style={styles.instructionText}>{medication.instruction_text}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function MedicationForm({
  onCancel,
  onSave,
  saving,
}: {
  onCancel: () => void;
  onSave: (name: string, instructions: string) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (saving) {
      return;
    }
    if (!name.trim() || !instructions.trim()) {
      setError('Enter a medication name and its instructions to continue.');
      return;
    }
    setError(null);
    try {
      await onSave(name, instructions);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Medication could not be saved. Please try again.',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.formKeyboardView}
    >
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.backButton}>
          <Text style={styles.backText}>‹  Medications</Text>
        </Pressable>
        <Text style={styles.pageEyebrow}>NEW ENTRY</Text>
        <Text style={styles.pageTitle}>Add medication</Text>
        <Text style={styles.pageSubtitle}>
          Enter the details as provided. Instructions are kept exactly as you type them.
        </Text>

        <Text style={styles.inputLabel}>Medication name</Text>
        <TextInput
          accessibilityLabel="Medication name"
          autoCapitalize="sentences"
          onChangeText={setName}
          placeholder="Enter medication name"
          placeholderTextColor="#94a3b8"
          returnKeyType="next"
          style={styles.input}
          value={name}
        />

        <Text style={styles.inputLabel}>Instructions</Text>
        <TextInput
          accessibilityLabel="Medication instructions"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={setInstructions}
          placeholder="Enter the instructions as written"
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.instructionsInput]}
          textAlignVertical="top"
          value={instructions}
        />

        <Text style={styles.formNote}>
          Adding medication details does not set up a schedule or turn on reminders.
        </Text>
        {error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <ActionButton
          label={saving ? 'Saving medication…' : 'Save medication'}
          disabled={saving}
          onPress={() => void save()}
        />
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onCancel}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TabButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.tabButton}
    >
      <Text style={[styles.tabText, selected && styles.selectedTabText]}>{label}</Text>
      {selected ? <View style={styles.selectedTabIndicator} /> : null}
    </Pressable>
  );
}

function ActionButton({
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
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.disabledButton,
        pressed && styles.pressedButton,
      ]}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f5f8fc',
    flex: 1,
  },
  appFrame: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 600,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#e5ebf2',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  brand: {
    color: '#1d4ed8',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  accountLabel: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
    maxWidth: 230,
  },
  signOutButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  signOutText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  pageContent: {
    alignSelf: 'center',
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 32,
    width: '100%',
  },
  pageEyebrow: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  pageTitle: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 37,
  },
  pageSubtitle: {
    color: '#64748b',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
    marginTop: 7,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  summaryTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  statusPill: {
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
  },
  neutralNote: {
    borderTopColor: '#e8edf4',
    borderTopWidth: 1,
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
    paddingTop: 13,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginTop: 26,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
  },
  countText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    padding: 17,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 7,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    padding: 17,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.55,
  },
  loadingMessage: {
    marginTop: 12,
    textAlign: 'center',
  },
  pressedButton: {
    opacity: 0.75,
  },
  medicationList: {
    gap: 12,
    marginTop: 20,
  },
  medicationCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 16,
  },
  medicationIcon: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  medicationIconText: {
    color: '#1d4ed8',
    fontSize: 17,
    fontWeight: '800',
  },
  medicationDetails: {
    flex: 1,
  },
  medicationName: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  instructionLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 4,
  },
  instructionText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
  },
  formKeyboardView: {
    flex: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 22,
    paddingVertical: 6,
  },
  backText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
  },
  inputLabel: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  instructionsInput: {
    minHeight: 120,
    paddingTop: 13,
  },
  formNote: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  errorBox: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
  },
  errorText: {
    color: '#9f1239',
    fontSize: 14,
    lineHeight: 20,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 8,
  },
  cancelText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5ebf2',
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingBottom: 4,
    paddingHorizontal: 12,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingTop: 8,
  },
  tabText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  selectedTabText: {
    color: '#1d4ed8',
  },
  selectedTabIndicator: {
    backgroundColor: '#1d4ed8',
    borderRadius: 2,
    height: 3,
    marginTop: 6,
    width: 24,
  },
});
