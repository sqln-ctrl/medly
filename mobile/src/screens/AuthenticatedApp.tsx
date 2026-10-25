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
  archiveMedication,
  createMedication as createMedicationRequest,
  getPatientProfile,
  listMedications,
  Medication,
} from '../api/medications';
import {
  archiveMedicationSchedule,
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
  ends_on: string | null;
  interval_days?: number;
  times: {
    day_of_week: number;
    local_time: string;
    meal_timing: ScheduleTime['meal_timing'];
  }[];
};

type ScheduleTime = MedicationSchedule['times'][number];

type TimeDraft = {
  hour: string;
  minute: string;
  period: 'AM' | 'PM';
  mealTiming: ScheduleTime['meal_timing'] | 'not_specified' | null;
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
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archivingItemId, setArchivingItemId] = useState<string | null>(null);
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
          getUpcomingDoses(accessToken, 30),
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

  const archiveMedicationEntry = useCallback(
    async (medicationId: string) => {
      setArchivingItemId(medicationId);
      setArchiveError(null);
      try {
        await archiveMedication(accessToken, medicationId);
        setReloadKey((current) => current + 1);
      } catch (archiveFailure) {
        setArchiveError(
          archiveFailure instanceof Error
            ? archiveFailure.message
            : 'The medication could not be removed.',
        );
      } finally {
        setArchivingItemId(null);
      }
    },
    [accessToken],
  );

  const archiveScheduleEntry = useCallback(
    async (scheduleId: string) => {
      setArchivingItemId(scheduleId);
      setArchiveError(null);
      try {
        await archiveMedicationSchedule(accessToken, scheduleId);
        setReloadKey((current) => current + 1);
      } catch (archiveFailure) {
        setArchiveError(
          archiveFailure instanceof Error
            ? archiveFailure.message
            : 'The schedule could not be removed.',
        );
      } finally {
        setArchivingItemId(null);
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
              onArchiveMedication={archiveMedicationEntry}
              onArchiveSchedule={archiveScheduleEntry}
              archivingItemId={archivingItemId}
              archiveError={archiveError}
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
        (dose) => {
          const doseDate = localDateFor(dose.scheduled_for, upcoming.timezone);
          return doseDate > upcoming.start_date && doseDate <= addDaysToDate(upcoming.start_date, 7);
        },
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
  onArchiveMedication,
  onArchiveSchedule,
  archivingItemId,
  archiveError,
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
  onArchiveMedication: (medicationId: string) => Promise<void>;
  onArchiveSchedule: (scheduleId: string) => Promise<void>;
  archivingItemId: string | null;
  archiveError: string | null;
}) {
  const [confirmMedicationId, setConfirmMedicationId] = useState<string | null>(null);
  const [confirmScheduleId, setConfirmScheduleId] = useState<string | null>(null);

  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.pageEyebrow}>YOUR LIST</Text>
      <Text style={styles.pageTitle}>Medications</Text>
      <Text style={styles.pageSubtitle}>
        Keep medication details and instructions together.
      </Text>
      {archiveError ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>{archiveError}</Text>
        </View>
      ) : null}

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
                <View style={styles.medicationTitleRow}>
                  <Text style={styles.medicationName}>{medication.name}</Text>
                  {confirmMedicationId === medication.id ? (
                    <View style={styles.archiveConfirmation}>
                      <Text style={styles.archiveWarning}>
                        Remove this medication and stop its schedules? Dose history will be kept.
                      </Text>
                      <View style={styles.archiveActions}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={archivingItemId === medication.id}
                          onPress={() => {
                            setConfirmMedicationId(null);
                            void onArchiveMedication(medication.id);
                          }}
                          style={styles.archiveConfirmButton}
                        >
                          <Text style={styles.archiveConfirmText}>
                            {archivingItemId === medication.id
                              ? 'Removing…'
                              : 'Remove medication'}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setConfirmMedicationId(null)}
                          style={styles.archiveCancelButton}
                        >
                          <Text style={styles.archiveCancelText}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${medication.name}`}
                      onPress={() => {
                        setConfirmScheduleId(null);
                        setConfirmMedicationId(medication.id);
                      }}
                      style={styles.deleteIconButton}
                    >
                      <View style={styles.trashCan}>
                        <View style={styles.trashLid} />
                        <View style={styles.trashBody}>
                          <View style={styles.trashLine} />
                          <View style={styles.trashLine} />
                          <View style={styles.trashLine} />
                        </View>
                      </View>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.instructionLabel}>INSTRUCTIONS</Text>
                <Text style={styles.instructionText}>{medication.instruction_text}</Text>
                {schedules
                  .filter((entry) => entry.medication.id === medication.id)
                  .map((entry) => (
                    <View key={entry.schedule.id} style={styles.scheduleSummary}>
                      <Text style={styles.scheduleSummaryText}>
                        {describeSchedule(entry.schedule, timezone ?? 'UTC')}
                      </Text>
                      <View style={styles.scheduleActions}>
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
                        {confirmScheduleId === entry.schedule.id ? (
                          <View style={styles.archiveConfirmation}>
                            <Text style={styles.archiveWarning}>
                              Stop this schedule? Its dose history will be kept.
                            </Text>
                            <View style={styles.archiveActions}>
                              <Pressable
                                accessibilityRole="button"
                                disabled={archivingItemId === entry.schedule.id}
                                onPress={() => {
                                  setConfirmScheduleId(null);
                                  void onArchiveSchedule(entry.schedule.id);
                                }}
                                style={styles.archiveConfirmButton}
                              >
                                <Text style={styles.archiveConfirmText}>
                                  {archivingItemId === entry.schedule.id
                                    ? 'Removing…'
                                    : 'Remove schedule'}
                                </Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => setConfirmScheduleId(null)}
                                style={styles.archiveCancelButton}
                              >
                                <Text style={styles.archiveCancelText}>Cancel</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setConfirmMedicationId(null);
                              setConfirmScheduleId(entry.schedule.id);
                            }}
                            style={styles.inlineButton}
                          >
                            <Text style={styles.archiveLinkText}>Remove schedule</Text>
                          </Pressable>
                        )}
                      </View>
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
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endsOn, setEndsOn] = useState(todayInTimezone(timezone));
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [doseTimes, setDoseTimes] = useState<TimeDraft[]>([
    { hour: '', minute: '00', period: 'AM', mealTiming: null },
  ]);
  const [intervalDays, setIntervalDays] = useState('2');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const mealTimingOptions: {
    value: TimeDraft['mealTiming'];
    label: string;
  }[] = [
    { value: 'not_specified', label: 'Not specified' },
    { value: 'before_breakfast', label: 'Before breakfast' },
    { value: 'after_breakfast', label: 'After breakfast' },
    { value: 'before_lunch', label: 'Before lunch' },
    { value: 'after_lunch', label: 'After lunch' },
    { value: 'before_dinner', label: 'Before dinner' },
    { value: 'after_dinner', label: 'After dinner' },
  ];

  const save = async () => {
    if (saving) {
      return;
    }
    if (!isValidDateString(startsOn)) {
      setError('Choose a valid start date.');
      return;
    }
    if (hasEndDate && !isValidDateString(endsOn)) {
      setError('Choose a valid end date.');
      return;
    }
    if (hasEndDate && endsOn < startsOn) {
      setError('The end date must be on or after the start date.');
      return;
    }
    if (doseTimes.length !== timesPerDay) {
      setError('Add a time for each scheduled dose.');
      return;
    }
    if (
      doseTimes.some(
        ({ hour, minute }) =>
          !/^(0?[1-9]|1[0-2])$/.test(hour) || !/^\d{2}$/.test(minute) || Number(minute) > 59,
      )
    ) {
      setError('Enter a valid time for each dose using a 1–12 hour and 00–59 minutes.');
      return;
    }
    if (doseTimes.some((time) => time.mealTiming === null)) {
      setError('Choose a meal timing or “Not specified” for each dose.');
      return;
    }
    const localTimes = doseTimes.map(({ hour, minute, period }) => {
      const hourNumber = Number(hour) % 12 + (period === 'PM' ? 12 : 0);
      return `${String(hourNumber).padStart(2, '0')}:${minute}`;
    });
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
        ends_on: hasEndDate ? endsOn : null,
        ...(cadence === 'interval' ? { interval_days: parsedInterval } : {}),
        times: (cadence === 'weekly' ? weekdays : [-1]).flatMap((dayOfWeek) =>
          localTimes.map((value, index) => ({
            day_of_week: dayOfWeek,
            local_time: `${value}:00`,
            meal_timing:
              doseTimes[index].mealTiming === 'not_specified'
                ? null
                : doseTimes[index].mealTiming,
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

        <CalendarDatePicker label="Start date" value={startsOn} onChange={setStartsOn} />

        <Text style={styles.inputLabel}>End date</Text>
        <View style={styles.choiceRow}>
          {[
            { value: false, label: 'No end date' },
            { value: true, label: 'Choose end date' },
          ].map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected: hasEndDate === option.value }}
              onPress={() => setHasEndDate(option.value)}
              style={[
                styles.choiceButton,
                hasEndDate === option.value && styles.selectedChoiceButton,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  hasEndDate === option.value && styles.selectedChoiceText,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {hasEndDate ? (
          <CalendarDatePicker label="Custom end date" value={endsOn} onChange={setEndsOn} />
        ) : null}

        <Text style={styles.inputLabel}>How many times per day?</Text>
        <View style={styles.choiceRow}>
          {[1, 2, 3].map((count) => (
            <Pressable
              key={count}
              accessibilityRole="button"
              accessibilityState={{ selected: timesPerDay === count }}
              onPress={() => {
                setTimesPerDay(count);
                setDoseTimes((current) =>
                  Array.from({ length: count }, (_, index) =>
                    current[index] ?? {
                      hour: '',
                      minute: '00',
                      period: 'AM',
                      mealTiming: null,
                    },
                  ),
                );
              }}
              style={[
                styles.choiceButton,
                timesPerDay === count && styles.selectedChoiceButton,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  timesPerDay === count && styles.selectedChoiceText,
                ]}
              >
                {count} {count === 1 ? 'time' : 'times'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.inputLabel}>Dose times and meal timing</Text>
        {doseTimes.map((doseTime, index) => (
          <View key={`dose-time-${index}`} style={styles.doseTimeCard}>
            <Text style={styles.cardTitle}>Dose {index + 1}</Text>
            <View style={styles.timeInputRow}>
              <TextInput
                accessibilityLabel={`Dose ${index + 1} hour`}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(hour) =>
                  setDoseTimes((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, hour } : item,
                    ),
                  )
                }
                placeholder="Hour"
                style={[styles.input, styles.clockInput]}
                value={doseTime.hour}
              />
              <Text style={styles.timeSeparator}>:</Text>
              <TextInput
                accessibilityLabel={`Dose ${index + 1} minute`}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(minute) =>
                  setDoseTimes((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, minute } : item,
                    ),
                  )
                }
                placeholder="MM"
                style={[styles.input, styles.clockInput]}
                value={doseTime.minute}
              />
              <View style={styles.periodChoices}>
                {(['AM', 'PM'] as const).map((period) => (
                  <Pressable
                    key={period}
                    accessibilityRole="button"
                    accessibilityState={{ selected: doseTime.period === period }}
                    onPress={() =>
                      setDoseTimes((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, period } : item,
                        ),
                      )
                    }
                    style={[
                      styles.periodButton,
                      doseTime.period === period && styles.selectedChoiceButton,
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        doseTime.period === period && styles.selectedChoiceText,
                      ]}
                    >
                      {period}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text style={styles.mealQuestion}>Before or after which meal?</Text>
            <View style={styles.mealChoices}>
              {mealTimingOptions.map((option) => (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: doseTime.mealTiming === option.value }}
                  onPress={() =>
                    setDoseTimes((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, mealTiming: option.value }
                          : item,
                      ),
                    )
                  }
                  style={[
                    styles.mealButton,
                    doseTime.mealTiming === option.value && styles.selectedChoiceButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      doseTime.mealTiming === option.value && styles.selectedChoiceText,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <Text style={styles.formNote}>
          Choose the times and meal notes from the instructions you were given. Medly does not infer or change medication instructions. Review and confirm this schedule before it becomes active.
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

function CalendarDatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1);
  });
  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const calendarDays = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
  }

  return (
    <View>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDateForDisplay(value)}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={styles.datePickerButton}
      >
        <Text style={styles.datePickerText}>▦  {formatDateForDisplay(value)}</Text>
      </Pressable>
      {open ? (
        <View style={styles.calendar}>
          <View style={styles.calendarHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              style={styles.calendarNavButton}
            >
              <Text style={styles.calendarNavText}>‹</Text>
            </Pressable>
            <Text style={styles.calendarMonth}>{monthLabel}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              style={styles.calendarNavButton}
            >
              <Text style={styles.calendarNavText}>›</Text>
            </Pressable>
          </View>
          <View style={styles.calendarGrid}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.calendarWeekday}>
                {day}
              </Text>
            ))}
            {calendarDays.map((day, index) => {
              if (day === null) {
                return <View key={`blank-${index}`} style={styles.calendarDay} />;
              }
              const date = `${visibleMonth.getFullYear()}-${String(
                visibleMonth.getMonth() + 1,
              ).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const selected = value === date;
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={formatDateForDisplay(date)}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(date);
                    setOpen(false);
                  }}
                  style={[
                    styles.calendarDay,
                    selected && styles.calendarSelectedDay,
                  ]}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      selected && styles.calendarSelectedDayText,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
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
        Confirming activates this schedule for dose tracking. You can go back without activating it.
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

function addDaysToDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function formatDateForDisplay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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
      const [hourValue, minute] = item.local_time.slice(0, 5).split(':').map(Number);
      const period = hourValue >= 12 ? 'PM' : 'AM';
      const timeLabel = `${hourValue % 12 || 12}:${String(minute).padStart(2, '0')} ${period}`;
      const mealTiming = item.meal_timing
        ? ` · ${item.meal_timing.replaceAll('_', ' ')}`
        : '';
      if (schedule.cadence === 'weekly') {
        return `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][item.day_of_week]} ${timeLabel}${mealTiming}`;
      }
      return `${timeLabel}${mealTiming}`;
    })
    .join(', ');
  const recurrence =
    schedule.cadence === 'interval'
      ? `Every ${schedule.interval_days} days`
      : schedule.cadence === 'weekly'
        ? 'Weekly'
        : 'Daily';
  const dateRange = schedule.ends_on
    ? `${schedule.starts_on} to ${schedule.ends_on}`
    : `${schedule.starts_on} · no end date`;
  return `${recurrence} · ${dateRange} · ${timeSummary} (${timezone})`;
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
  medicationTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  deleteIconButton: {
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginTop: -5,
    width: 36,
  },
  trashCan: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'flex-end',
    width: 20,
  },
  trashLid: {
    backgroundColor: '#b91c1c',
    borderRadius: 1,
    height: 2,
    marginBottom: 2,
    width: 16,
  },
  trashBody: {
    alignItems: 'center',
    borderBottomColor: '#b91c1c',
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderColor: '#b91c1c',
    borderTopWidth: 0,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 2,
    height: 15,
    justifyContent: 'center',
    width: 13,
  },
  trashLine: {
    backgroundColor: '#b91c1c',
    borderRadius: 1,
    height: 8,
    width: 1,
  },
  scheduleSummary: {
    borderTopColor: '#e8edf4',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  scheduleActions: {
    alignItems: 'flex-start',
  },
  archiveConfirmation: {
    alignSelf: 'stretch',
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    padding: 10,
  },
  archiveWarning: {
    color: '#7c2d12',
    fontSize: 12,
    lineHeight: 18,
  },
  archiveActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 7,
  },
  archiveConfirmButton: {
    paddingVertical: 6,
  },
  archiveConfirmText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
  },
  archiveCancelButton: {
    paddingVertical: 6,
  },
  archiveCancelText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  archiveLinkText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
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
  doseTimeCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  clockInput: {
    flex: 1,
    minWidth: 52,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  timeSeparator: {
    color: '#334155',
    fontSize: 20,
    fontWeight: '700',
  },
  periodChoices: {
    flexDirection: 'row',
    gap: 4,
  },
  periodButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 9,
  },
  mealQuestion: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 6,
  },
  mealChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  mealButton: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  datePickerButton: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  datePickerText: {
    color: '#0f172a',
    fontSize: 15,
  },
  calendar: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    padding: 10,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calendarNavButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 40,
  },
  calendarNavText: {
    color: '#1d4ed8',
    fontSize: 26,
  },
  calendarMonth: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarWeekday: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 8,
    textAlign: 'center',
    width: '14.2857%',
  },
  calendarDay: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: '14.2857%',
  },
  calendarSelectedDay: {
    backgroundColor: '#1d4ed8',
  },
  calendarDayText: {
    color: '#334155',
    fontSize: 14,
  },
  calendarSelectedDayText: {
    color: '#ffffff',
    fontWeight: '700',
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
