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
  getPatientProfile,
  listMedications,
  Medication,
} from '../api/medications';
import {
  confirmMedicationSchedule,
  getDoseAdherence,
  createMedicationSchedule,
  getDoseHistory,
  getUpcomingDoses,
  listMedicationSchedules,
  reportDose,
  DoseHistory,
  DoseAdherence,
  DoseReport,
  DoseStatus,
  MedicationSchedule,
  UpcomingDose,
  UpcomingDoses,
} from '../api/reminders';
import { ReminderControls } from './ReminderControls';

type AuthenticatedAppProps = {
  accessToken: string;
  email: string;
  busy: boolean;
  error: string | null;
  onSignOut: () => void;
};

type Tab = 'today' | 'medications' | 'history';

type ScheduleDraft = {
  cadence: MedicationSchedule['cadence'];
  starts_on: string;
  interval_days?: number;
  times: { day_of_week: number; local_time: string }[];
};

type MedicationScheduleEntry = {
  medication: Medication;
  schedule: MedicationSchedule;
};

export function AuthenticatedApp({
  accessToken,
  email,
  busy,
  error,
  onSignOut,
}: AuthenticatedAppProps) {
  const [tab, setTab] = useState<Tab>('today');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [schedules, setSchedules] = useState<MedicationScheduleEntry[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingDoses | null>(null);
  const [doseHistory, setDoseHistory] = useState<DoseHistory | null>(null);
  const [doseAdherence, setDoseAdherence] = useState<DoseAdherence | null>(null);
  const [patientTimezone, setPatientTimezone] = useState<string | null>(null);
  const [addingMedication, setAddingMedication] = useState(false);
  const [scheduleMedication, setScheduleMedication] = useState<Medication | null>(null);
  const [reviewEntry, setReviewEntry] = useState<MedicationScheduleEntry | null>(null);
  const [loadingMedications, setLoadingMedications] = useState(true);
  const [medicationError, setMedicationError] = useState<string | null>(null);
  const [doseError, setDoseError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [adherenceError, setAdherenceError] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [savingMedication, setSavingMedication] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [confirmingSchedule, setConfirmingSchedule] = useState(false);
  const [scheduleActionError, setScheduleActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadingMedications(true);
    setMedicationError(null);
    setDoseError(null);
    setHistoryError(null);
    setAdherenceError(null);
    setTimezoneError(null);
    void (async () => {
      try {
        const [
          medicationsResult,
          dosesResult,
          profileResult,
          historyResult,
          adherenceResult,
        ] = await Promise.allSettled([
          listMedications(accessToken),
          getUpcomingDoses(accessToken),
          getPatientProfile(accessToken),
          getDoseHistory(accessToken),
          getDoseAdherence(accessToken),
        ]);
        if (cancelled) {
          return;
        }
        if (dosesResult.status === 'fulfilled') {
          setUpcoming(dosesResult.value);
        } else {
          setDoseError(
            dosesResult.reason instanceof Error
              ? dosesResult.reason.message
              : 'Upcoming doses could not be loaded. Please try again.',
          );
        }
        if (historyResult.status === 'fulfilled') {
          setDoseHistory(historyResult.value);
        } else {
          setHistoryError(
            historyResult.reason instanceof Error
              ? historyResult.reason.message
              : 'Dose history could not be loaded. Please try again.',
          );
        }
        if (adherenceResult.status === 'fulfilled') {
          setDoseAdherence(adherenceResult.value);
        } else {
          setAdherenceError(
            adherenceResult.reason instanceof Error
              ? adherenceResult.reason.message
              : 'Adherence summary could not be loaded. Please try again.',
          );
        }
        if (profileResult.status === 'fulfilled') {
          setPatientTimezone(profileResult.value.timezone);
        } else {
          setPatientTimezone(null);
          setTimezoneError(
            profileResult.reason instanceof Error
              ? profileResult.reason.message
              : 'Your timezone could not be loaded.',
          );
        }
        if (medicationsResult.status === 'rejected') {
          setMedicationError(
            medicationsResult.reason instanceof Error
              ? medicationsResult.reason.message
              : 'Medications could not be loaded. Please try again.',
          );
          return;
        }
        const result = medicationsResult.value;
        const scheduleResults = await Promise.all(
          result.map(async (medication) => ({
            medication,
            schedules: await listMedicationSchedules(accessToken, medication.id),
          })),
        );
        if (!cancelled) {
          setMedications(result);
          setSchedules(
            scheduleResults.flatMap(({ medication, schedules: medicationSchedules }) =>
              medicationSchedules.map((schedule) => ({ medication, schedule })),
            ),
          );
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setMedicationError(
            loadError instanceof Error
              ? loadError.message
              : 'Medications could not be loaded. Please try again.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingMedications(false);
        }
      }
    })();
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

  const saveSchedule = useCallback(
    async (draft: ScheduleDraft) => {
      if (!scheduleMedication || !patientTimezone) {
        return;
      }
      setSavingSchedule(true);
      try {
        const schedule = await createMedicationSchedule(
          accessToken,
          scheduleMedication.id,
          draft,
        );
        const entry = { medication: scheduleMedication, schedule };
        setSchedules((current) => [entry, ...current]);
        setScheduleMedication(null);
        setReviewEntry(entry);
      } finally {
        setSavingSchedule(false);
      }
    },
    [accessToken, patientTimezone, scheduleMedication],
  );

  const confirmSchedule = useCallback(
    async (entry: MedicationScheduleEntry) => {
      setConfirmingSchedule(true);
      setScheduleActionError(null);
      try {
        const schedule = await confirmMedicationSchedule(accessToken, entry.schedule.id);
        setSchedules((current) =>
          current.map((currentEntry) =>
            currentEntry.schedule.id === schedule.id
              ? { ...currentEntry, schedule }
              : currentEntry,
          ),
        );
        setReviewEntry(null);
        setReloadKey((current) => current + 1);
      } catch (confirmError) {
        setScheduleActionError(
          confirmError instanceof Error
            ? confirmError.message
            : 'The schedule could not be confirmed. Please try again.',
        );
      } finally {
        setConfirmingSchedule(false);
      }
    },
    [accessToken],
  );

  const saveDoseReport = useCallback(
    async (dose: UpcomingDose, status: DoseStatus) => {
      await reportDose(accessToken, dose, status);
      setReloadKey((current) => current + 1);
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
          <View style={styles.headerActions}>
            <ReminderControls doses={upcoming?.doses ?? null} />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onSignOut}
              style={styles.signOutButton}
            >
              <Text style={styles.signOutText}>{busy ? 'Signing out…' : 'Sign out'}</Text>
            </Pressable>
          </View>
        </View>

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.content}>
          {scheduleMedication ? (
            <ScheduleForm
              medication={scheduleMedication}
              timezone={patientTimezone ?? 'UTC'}
              saving={savingSchedule}
              onCancel={() => setScheduleMedication(null)}
              onSave={saveSchedule}
            />
          ) : reviewEntry ? (
            <ScheduleReview
              entry={reviewEntry}
              timezone={patientTimezone ?? 'UTC'}
              confirming={confirmingSchedule}
              error={scheduleActionError}
              onCancel={() => setReviewEntry(null)}
              onConfirm={() => void confirmSchedule(reviewEntry)}
            />
          ) : tab === 'history' ? (
            <DoseHistoryScreen
              history={doseHistory}
              adherence={doseAdherence}
              loading={loadingMedications}
              historyError={historyError}
              adherenceError={adherenceError}
              onRetry={() => setReloadKey((current) => current + 1)}
            />
          ) : addingMedication ? (
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
              upcoming={upcoming}
              doseError={doseError}
              onRetry={() => setReloadKey((current) => current + 1)}
              onViewMedications={() => setTab('medications')}
              onReportDose={saveDoseReport}
            />
          ) : (
            <MedicationsScreen
              medications={medications}
              error={medicationError}
              loading={loadingMedications}
              onRetry={() => setReloadKey((current) => current + 1)}
              onAdd={() => setAddingMedication(true)}
              schedules={schedules}
              timezone={patientTimezone}
              scheduleEnabled={patientTimezone !== null}
              timezoneError={timezoneError}
              onCreateSchedule={(medication) => setScheduleMedication(medication)}
              onReviewSchedule={(entry) => setReviewEntry(entry)}
              onReportDose={saveDoseReport}
            />
          )}
        </View>

        {!addingMedication && !scheduleMedication && !reviewEntry ? (
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
            <TabButton
              label="History"
              selected={tab === 'history'}
              onPress={() => setTab('history')}
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
  upcoming,
  doseError,
  onRetry,
  onViewMedications,
  onReportDose,
}: {
  medicationCount: number;
  loading: boolean;
  error: string | null;
  upcoming: UpcomingDoses | null;
  doseError: string | null;
  onRetry: () => void;
  onViewMedications: () => void;
  onReportDose: (dose: UpcomingDose, status: DoseStatus) => Promise<void>;
}) {
  const todayDoses = upcoming
    ? upcoming.doses.filter(
        (dose) => localDateFor(dose.scheduled_for, upcoming.timezone) === upcoming.start_date,
      )
    : [];
  const upcomingDoses = upcoming
    ? upcoming.doses.filter(
        (dose) => localDateFor(dose.scheduled_for, upcoming.timezone) !== upcoming.start_date,
      )
    : [];

  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.pageEyebrow}>YOUR DAY</Text>
      <Text style={styles.pageTitle}>Today</Text>
      <Text style={styles.pageSubtitle}>A clear place to keep track of your medication routine.</Text>

      <View style={styles.summaryCard}>
        <Text style={styles.cardBody}>
          Only schedules you have reviewed and confirmed appear here. Saving medication details alone never creates reminders.
        </Text>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Today’s doses</Text>
      </View>
      {doseError ? (
        <View accessibilityRole="alert" style={styles.emptyCard}>
          <Text style={styles.cardBody}>{doseError}</Text>
          <ActionButton label="Try again" onPress={onRetry} />
        </View>
      ) : loading || !upcoming ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color="#1d4ed8" />
          <Text style={[styles.cardBody, styles.loadingMessage]}>Loading scheduled doses…</Text>
        </View>
      ) : todayDoses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No scheduled doses today</Text>
          <Text style={styles.cardBody}>
            {error
              ? 'Your medication list could not be loaded. Retry to check your current schedules.'
              : medicationCount === 0
              ? 'Add a medication, set up its schedule, then review and confirm it to see doses here.'
              : 'Confirmed schedules with doses for today will appear here.'}
          </Text>
          <ActionButton label="View medications" onPress={onViewMedications} />
        </View>
      ) : (
        <DoseList
          doses={todayDoses}
          timezone={upcoming.timezone}
          onReportDose={onReportDose}
        />
      )}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Upcoming</Text>
        <Text style={styles.countText}>Next 7 days</Text>
      </View>
      {!loading && upcoming && upcomingDoses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.cardBody}>No other doses are scheduled in the next 7 days.</Text>
        </View>
      ) : upcoming ? (
        <DoseList
          doses={upcomingDoses}
          timezone={upcoming.timezone}
        />
      ) : null}

      {error && !doseError ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <ActionButton label="Reload" onPress={onRetry} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function MedicationsScreen({
  medications,
  schedules,
  timezone,
  scheduleEnabled,
  timezoneError,
  error,
  loading,
  onRetry,
  onAdd,
  onCreateSchedule,
  onReviewSchedule,
  onReportDose,
}: {
  medications: Medication[];
  schedules: MedicationScheduleEntry[];
  timezone: string | null;
  scheduleEnabled: boolean;
  timezoneError: string | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  onAdd: () => void;
  onCreateSchedule: (medication: Medication) => void;
  onReviewSchedule: (entry: MedicationScheduleEntry) => void;
  onReportDose: (dose: UpcomingDose, status: DoseStatus) => Promise<void>;
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
                {schedules
                  .filter((entry) => entry.medication.id === medication.id)
                  .map((entry) => (
                    <View key={entry.schedule.id} style={styles.scheduleSummary}>
                      <Text style={styles.scheduleSummaryText}>
                        {describeSchedule(entry.schedule, timezone ?? 'UTC')}
                      </Text>
                      {entry.schedule.confirmed_at ? (
                        <Text style={styles.confirmedText}>Confirmed and active</Text>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onReviewSchedule(entry)}
                          style={styles.inlineButton}
                        >
                          <Text style={styles.inlineButtonText}>Review and confirm</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                <Pressable
                  accessibilityRole="button"
                  disabled={!scheduleEnabled}
                  onPress={() => onCreateSchedule(medication)}
                  style={styles.inlineButton}
                >
                  <Text style={[styles.inlineButtonText, !scheduleEnabled && styles.disabledText]}>
                    {scheduleEnabled ? 'Set up schedule' : 'Timezone unavailable'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      {timezoneError ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>
            Timezone unavailable: {timezoneError} Schedules can’t be created until your timezone loads.
          </Text>
          <ActionButton label="Retry" onPress={onRetry} />
        </View>
      ) : null}
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

function ScheduleForm({
  medication,
  timezone,
  saving,
  onCancel,
  onSave,
}: {
  medication: Medication;
  timezone: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: ScheduleDraft) => Promise<void>;
}) {
  const [cadence, setCadence] = useState<MedicationSchedule['cadence']>('daily');
  const [startsOn, setStartsOn] = useState(todayInTimezone(timezone));
  const [localTimes, setLocalTimes] = useState(['08:00']);
  const [intervalDays, setIntervalDays] = useState('2');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const save = async () => {
    if (saving) {
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
      setError('Enter a start date in YYYY-MM-DD format.');
      return;
    }
    if (localTimes.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
      setError('Enter each local time in 24-hour HH:MM format.');
      return;
    }
    if (new Set(localTimes).size !== localTimes.length) {
      setError('Reminder times must be unique.');
      return;
    }
    if (cadence === 'weekly' && weekdays.length === 0) {
      setError('Select at least one day of the week.');
      return;
    }
    const parsedInterval = Number(intervalDays);
    if (
      cadence === 'interval' &&
      (!Number.isInteger(parsedInterval) || parsedInterval < 1)
    ) {
      setError('Enter a positive number of days between doses.');
      return;
    }
    setError(null);
    try {
      await onSave({
        cadence,
        starts_on: startsOn,
        ...(cadence === 'interval' ? { interval_days: parsedInterval } : {}),
        times: (cadence === 'weekly' ? weekdays : [-1]).flatMap((dayOfWeek) =>
          localTimes.map((value) => ({
            day_of_week: dayOfWeek,
            local_time: `${value}:00`,
          })),
        ),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'The schedule could not be saved. Please try again.',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.formKeyboardView}
    >
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={styles.backButton}>
          <Text style={styles.backText}>‹  Medications</Text>
        </Pressable>
        <Text style={styles.pageEyebrow}>SCHEDULE</Text>
        <Text style={styles.pageTitle}>Set up schedule</Text>
        <Text style={styles.pageSubtitle}>
          {medication.name}. Times and dates use your patient timezone ({timezone}). Review the details before confirming; saving this schedule does not activate it.
        </Text>

        <Text style={styles.inputLabel}>Repeat</Text>
        <View style={styles.choiceRow}>
          {(['daily', 'weekly', 'interval'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: cadence === value }}
              onPress={() => setCadence(value)}
              style={[styles.choiceButton, cadence === value && styles.selectedChoiceButton]}
            >
              <Text style={[styles.choiceText, cadence === value && styles.selectedChoiceText]}>
                {value === 'interval' ? 'Every N days' : value[0].toUpperCase() + value.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {cadence === 'weekly' ? (
          <>
            <Text style={styles.inputLabel}>Days</Text>
            <View style={styles.choiceRow}>
              {weekdayLabels.map((label, day) => {
                const selected = weekdays.includes(day);
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() =>
                      setWeekdays((current) =>
                        selected
                          ? current.filter((value) => value !== day)
                          : [...current, day].sort(),
                      )
                    }
                    style={[styles.weekdayButton, selected && styles.selectedChoiceButton]}
                  >
                    <Text style={[styles.choiceText, selected && styles.selectedChoiceText]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {cadence === 'interval' ? (
          <>
            <Text style={styles.inputLabel}>Repeat every (days)</Text>
            <TextInput
              accessibilityLabel="Repeat interval in days"
              keyboardType="number-pad"
              onChangeText={setIntervalDays}
              style={styles.input}
              value={intervalDays}
            />
          </>
        ) : null}

        <Text style={styles.inputLabel}>Start date</Text>
        <TextInput
          accessibilityLabel="Schedule start date"
          onChangeText={setStartsOn}
          placeholder="YYYY-MM-DD"
          style={styles.input}
          value={startsOn}
        />

        <Text style={styles.inputLabel}>Scheduled dose times</Text>
        {localTimes.map((value, index) => (
          <View key={`local-time-${index}`} style={styles.timeInputRow}>
            <TextInput
              accessibilityLabel={`Scheduled dose time ${index + 1}`}
              onChangeText={(nextValue) =>
                setLocalTimes((current) =>
                  current.map((currentValue, currentIndex) =>
                    currentIndex === index ? nextValue : currentValue,
                  ),
                )
              }
              placeholder="HH:MM"
              style={[styles.input, styles.timeInput]}
              value={value}
            />
            {localTimes.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove time ${index + 1}`}
                onPress={() =>
                  setLocalTimes((current) => current.filter((_, currentIndex) => currentIndex !== index))
                }
                style={styles.removeTimeButton}
              >
                <Text style={styles.cancelText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setLocalTimes((current) => [...current, '08:00'])}
          style={styles.inlineButton}
        >
          <Text style={styles.inlineButtonText}>＋ Add another time</Text>
        </Pressable>
        <Text style={styles.formNote}>
          This schedule is not active yet. Review and confirm it on the next screen to enable dose tracking. Browser and device notifications are not available yet.
        </Text>
        {error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <ActionButton
          label={saving ? 'Saving schedule…' : 'Review schedule'}
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

function ScheduleReview({
  entry,
  timezone,
  confirming,
  error,
  onCancel,
  onConfirm,
}: {
  entry: MedicationScheduleEntry;
  timezone: string;
  confirming: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.pageEyebrow}>REVIEW BEFORE ACTIVATING</Text>
      <Text style={styles.pageTitle}>Confirm schedule</Text>
      <Text style={styles.pageSubtitle}>
        Check these schedule details. No clinical instructions are inferred or changed.
      </Text>
      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>{entry.medication.name}</Text>
        <Text style={styles.scheduleReviewText}>
          {describeSchedule(entry.schedule, timezone)}
        </Text>
        <Text style={styles.instructionLabel}>MEDICATION INSTRUCTIONS</Text>
        <Text style={styles.instructionText}>{entry.medication.instruction_text}</Text>
      </View>
      <Text style={styles.formNote}>
        Confirming activates this schedule for dose tracking. Browser and device notifications are not available yet. You can go back without activating it.
      </Text>
      {error ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <ActionButton
        label={confirming ? 'Confirming…' : 'Confirm and activate schedule'}
        disabled={confirming}
        onPress={onConfirm}
      />
      <Pressable
        accessibilityRole="button"
        disabled={confirming}
        onPress={onCancel}
        style={styles.cancelButton}
      >
        <Text style={styles.cancelText}>Not now</Text>
      </Pressable>
    </ScrollView>
  );
}

function DoseList({
  doses,
  timezone,
  onReportDose,
}: {
  doses: (UpcomingDose | DoseReport)[];
  timezone: string;
  onReportDose?: (dose: UpcomingDose, status: DoseStatus) => Promise<void>;
}) {
  if (doses.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.cardBody}>No other doses are scheduled in this period.</Text>
      </View>
    );
  }
  return (
    <View style={styles.doseList}>
      {doses.map((dose) => (
        <DoseListItem
          key={`${dose.schedule_id}-${dose.scheduled_for}`}
          dose={dose}
          timezone={timezone}
          onReportDose={onReportDose}
        />
      ))}
    </View>
  );
}

function DoseListItem({
  dose,
  timezone,
  onReportDose,
}: {
  dose: UpcomingDose | DoseReport;
  timezone: string;
  onReportDose?: (dose: UpcomingDose, status: DoseStatus) => Promise<void>;
}) {
  const [savingStatus, setSavingStatus] = useState<DoseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canReport = Boolean(onReportDose) && new Date(dose.scheduled_for) <= new Date();
  const scheduledDose: UpcomingDose = {
    schedule_id: dose.schedule_id,
    medication_id: dose.medication_id,
    medication_name: dose.medication_name,
    scheduled_for: dose.scheduled_for,
    status: dose.status,
  };
  const recordStatus = async (status: DoseStatus) => {
    if (!onReportDose || savingStatus) {
      return;
    }
    setSavingStatus(status);
    setError(null);
    try {
      await onReportDose(scheduledDose, status);
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : 'Your report could not be saved. Please try again.',
      );
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <View style={styles.doseCard}>
      <View style={styles.doseDetails}>
        <Text style={styles.medicationName}>{dose.medication_name}</Text>
        <Text style={styles.doseTime}>{formatDoseDateTime(dose.scheduled_for, timezone)}</Text>
        {dose.status ? (
          <Text style={styles.reportedStatus}>You reported: {dose.status}</Text>
        ) : null}
      </View>
      {canReport && onReportDose ? (
        <View style={styles.reportActions}>
          {(['taken', 'skipped', 'missed'] as const).map((status) => (
            <Pressable
              key={status}
              accessibilityRole="button"
              accessibilityState={{
                disabled: savingStatus !== null,
                selected: dose.status === status,
              }}
              disabled={savingStatus !== null}
              onPress={() => void recordStatus(status)}
              style={[
                styles.reportButton,
                dose.status === status && styles.selectedReportButton,
              ]}
            >
              <Text
                style={[
                  styles.reportButtonText,
                  dose.status === status && styles.selectedReportButtonText,
                ]}
              >
                {savingStatus === status ? 'Saving…' : status[0].toUpperCase() + status.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {onReportDose && !canReport ? (
        <Text style={styles.reportedStatus}>Report available after scheduled time</Text>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.reportError}>{error}</Text> : null}
    </View>
  );
}

function DoseHistoryScreen({
  history,
  adherence,
  loading,
  historyError,
  adherenceError,
  onRetry,
}: {
  history: DoseHistory | null;
  adherence: DoseAdherence | null;
  loading: boolean;
  historyError: string | null;
  adherenceError: string | null;
  onRetry: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.pageEyebrow}>YOUR RECORDS</Text>
      <Text style={styles.pageTitle}>Dose history</Text>
      <Text style={styles.pageSubtitle}>
        User-reported events from the last 30 days. No unreported doses are labeled as missed.
      </Text>
      {loading ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color="#1d4ed8" />
          <Text style={[styles.cardBody, styles.loadingMessage]}>Loading dose history…</Text>
        </View>
      ) : historyError && adherenceError ? (
        <View accessibilityRole="alert" style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Dose history couldn’t be loaded</Text>
          <Text style={styles.cardBody}>{historyError}</Text>
          <Text style={styles.cardBody}>{adherenceError}</Text>
          <ActionButton label="Try again" onPress={onRetry} />
        </View>
      ) : (
        <>
          {adherenceError ? (
            <View accessibilityRole="alert" style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Adherence summary couldn’t be loaded</Text>
              <Text style={styles.cardBody}>{adherenceError}</Text>
              <ActionButton label="Try again" onPress={onRetry} />
            </View>
          ) : null}
          {adherence ? (
            <View style={styles.summaryCard}>
              <Text style={styles.cardTitle}>Summary of your reports</Text>
              <Text style={styles.historyRange}>
                {adherence.start_date} – {adherence.end_date} · {adherence.timezone}
              </Text>
              <Text style={styles.cardBody}>
                {adherence.total_reported === 0
                  ? 'No dose reports in this period.'
                  : `${adherence.total_reported} reports: ${adherence.taken} taken, ${adherence.skipped} skipped, ${adherence.missed} marked missed.`}
              </Text>
              {adherence.reported_taken_percentage !== null ? (
                <Text style={styles.adherencePercentage}>
                  {adherence.reported_taken_percentage}% of your reports were marked taken
                </Text>
              ) : null}
              {adherence.medications.map((summary) => (
                <View key={summary.medication_id} style={styles.adherenceRow}>
                  <Text style={styles.medicationName}>{summary.medication_name}</Text>
                  <Text style={styles.cardBody}>
                    {summary.taken} taken · {summary.skipped} skipped · {summary.missed} marked missed
                  </Text>
                  {summary.reported_taken_percentage !== null ? (
                    <Text style={styles.adherencePercentage}>
                      {summary.reported_taken_percentage}% of reports marked taken
                    </Text>
                  ) : null}
                </View>
              ))}
              <Text style={styles.formNote}>
                These counts reflect only events you reported. Scheduled doses without a report are not classified.
              </Text>
            </View>
          ) : null}
          {historyError ? (
            <View accessibilityRole="alert" style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Dose history couldn’t be loaded</Text>
              <Text style={styles.cardBody}>{historyError}</Text>
              <ActionButton label="Try again" onPress={onRetry} />
            </View>
          ) : history?.events.length ? (
            <>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Reported events</Text>
              </View>
              <DoseList doses={history.events} timezone={history.timezone} />
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No dose reports yet</Text>
              <Text style={styles.cardBody}>
                Reports you add from Today will appear here.
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function localDateFor(value: string, timezone: string | undefined): string {
  const date = timezone ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...(timezone ? { timeZone: timezone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function todayInTimezone(timezone: string): string {
  return localDateFor(new Date().toISOString(), timezone);
}

function formatDoseDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function describeSchedule(schedule: MedicationSchedule, timezone: string): string {
  const timeSummary = schedule.times
    .map((item) => {
      const timeLabel = item.local_time.slice(0, 5);
      if (schedule.cadence === 'weekly') {
        return `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][item.day_of_week]} ${timeLabel}`;
      }
      return timeLabel;
    })
    .join(', ');
  const recurrence =
    schedule.cadence === 'interval'
      ? `Every ${schedule.interval_days} days`
      : schedule.cadence === 'weekly'
        ? 'Weekly'
        : 'Daily';
  return `${recurrence} · starts ${schedule.starts_on} · ${timeSummary} (${timezone})`;
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
  headerActions: {
    alignItems: 'flex-end',
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
  scheduleReviewText: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 18,
    marginTop: 12,
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
  scheduleSummary: {
    borderTopColor: '#e8edf4',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  scheduleSummaryText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  confirmedText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
  },
  inlineButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledText: {
    color: '#94a3b8',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  timeInput: {
    flex: 1,
  },
  removeTimeButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  choiceButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  weekdayButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 42,
    paddingHorizontal: 8,
  },
  selectedChoiceButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#1d4ed8',
  },
  choiceText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  selectedChoiceText: {
    color: '#1d4ed8',
  },
  doseList: {
    gap: 10,
  },
  doseCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 15,
  },
  doseDetails: {
    flex: 1,
  },
  doseTime: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 5,
  },
  reportActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  reportButton: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 9,
  },
  selectedReportButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#1d4ed8',
  },
  reportButtonText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  selectedReportButtonText: {
    color: '#1d4ed8',
  },
  reportError: {
    color: '#9f1239',
    flexBasis: '100%',
    fontSize: 12,
    marginTop: 4,
  },
  historyRange: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 10,
  },
  adherencePercentage: {
    color: '#1e3a8a',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  adherenceRow: {
    borderTopColor: '#e8edf4',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  reportedStatus: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
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
