import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createMedication } from '../api/medications';
import {
  createMedicationSchedule,
  MedicationSchedule,
} from '../api/reminders';
import { readPrescription } from '../prescriptions/readPrescription';
import { Medication } from '../api/medications';

type PrescriptionImportScreenProps = {
  accessToken: string;
  timezone: string;
  onCancel: () => void;
  onMedicationSaved: (medication: Medication) => void;
  onComplete: (medication: Medication, schedule: MedicationSchedule) => void;
};

function dailyDoseCountFromText(text: string): number | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  if (
    /\b(?:twice|two times?)\s+(?:(?:a|per)\s+)?day\b|\btwice daily\b|\b2\s*x\s*daily\b/.test(
      normalized,
    )
  ) {
    return 2;
  }
  if (
    /\b(?:once|one time?)\s+(?:(?:a|per)\s+)?day\b|\bonce daily\b|\b1\s*x\s*daily\b/.test(
      normalized,
    )
  ) {
    return 1;
  }
  const match =
    normalized.match(/\b([1-9])\s+times?\s+(?:a|per)\s+day\b/) ??
    normalized.match(/\b([1-9])\s+times?\s+daily\b/) ??
    normalized.match(/\b([1-9])\s*x\s*daily\b/) ??
    normalized.match(/\b([1-9])\s+doses?\s+(?:a|per)\s+day\b/);
  return match ? Number(match[1]) : null;
}

function explicitTimesFromText(text: string): string[] {
  const times: string[] = [];
  const pattern = /\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const hour = Number(match[1]);
    if (hour < 1 || hour > 12) {
      continue;
    }
    const isAfternoon = match[3].toLowerCase().startsWith('p');
    const hour24 = (hour % 12) + (isAfternoon ? 12 : 0);
    const time = `${String(hour24).padStart(2, '0')}:${match[2] ?? '00'}`;
    if (!times.includes(time)) {
      times.push(time);
    }
  }
  return times;
}

function medicationNameFromText(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    if (/\b(?:patient|prescriber|pharmacy|address|date)\b/i.test(line)) {
      continue;
    }
    const strength = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|μg|g|ml|mL|units?)\b/i.exec(line);
    if (!strength || strength.index === undefined) {
      continue;
    }
    const candidate = line
      .slice(0, strength.index)
      .replace(/^\s*(?:medication|medicine|drug|rx)\s*[:#-]?\s*/i, '')
      .replace(/^\s*\d+[.)]\s*/, '')
      .replace(/[:;,–-]\s*$/, '')
      .trim();
    if (candidate) {
      return candidate;
    }
  }
  return '';
}

function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function PrescriptionImportScreen({
  accessToken,
  timezone,
  onCancel,
  onMedicationSaved,
  onComplete,
}: PrescriptionImportScreenProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [doseTimes, setDoseTimes] = useState<string[]>(['']);
  const [savedMedication, setSavedMedication] = useState<Medication | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState(false);
  const [frequencyUnclear, setFrequencyUnclear] = useState(false);
  const [scheduleUnsupported, setScheduleUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choosePrescription = async () => {
    setError(null);
    setReading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) {
        return;
      }
      const uri = result.assets[0]?.uri;
      if (!uri) {
        setError('The selected photo could not be opened. Please choose another image.');
        return;
      }

      setImageUri(uri);
      setRecognizedText('');
      setInstructions('');
      setSavedMedication(null);
      setVerified(false);
      setScheduleUnsupported(false);
      const text = await readPrescription(uri);
      setRecognizedText(text);
      setInstructions(text);
      setName(medicationNameFromText(text));
      const recognizedTimes = explicitTimesFromText(text);
      const detectedCount = dailyDoseCountFromText(text);
      setFrequencyUnclear(!detectedCount && recognizedTimes.length === 0);
      const count = detectedCount || recognizedTimes.length || 1;
      if (count > 3) {
        setDoseTimes(['', '', '']);
        setScheduleUnsupported(true);
        setError('This schedule has more than three daily doses, which Medly cannot currently schedule.');
      } else if (detectedCount && recognizedTimes.length && detectedCount !== recognizedTimes.length) {
        setDoseTimes(Array.from({ length: count }, () => ''));
        setError('The recognized number of doses and times do not match. Enter each prescribed time.');
      } else {
        setDoseTimes(
          Array.from({ length: count }, (_, index) => recognizedTimes[index] ?? ''),
        );
      }
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : 'The photo could not be selected or read. Please try again.',
      );
    } finally {
      setReading(false);
    }
  };

  const updateDoseCount = (count: number) => {
    setDoseTimes((current) =>
      Array.from({ length: count }, (_, index) => current[index] ?? ''),
    );
    setVerified(false);
    setError(null);
  };

  const saveMedicationAndSchedule = async () => {
    if (saving) {
      return;
    }
    if (!imageUri || !recognizedText) {
      setError('Choose a prescription photo and read its text before continuing.');
      return;
    }
    if (!name.trim() || !instructions.trim()) {
      setError('Enter the medication name and review the instructions before continuing.');
      return;
    }
    if (!verified) {
      setError('Review the recognized instructions and each reminder time before continuing.');
      return;
    }
    if (scheduleUnsupported) {
      setError('This schedule cannot be imported because it exceeds Medly’s three-times-per-day limit.');
      return;
    }
    const normalizedTimes = doseTimes.map((value) => value.trim());
    if (
      normalizedTimes.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    ) {
      setError('Enter a valid 24-hour local time for every dose, such as 08:30 or 20:00.');
      return;
    }
    if (new Set(normalizedTimes).size !== normalizedTimes.length) {
      setError('Each reminder must have a different time.');
      return;
    }

    setSaving(true);
    setError(null);
    let medicationCreated = false;
    try {
      const medication =
        savedMedication ??
        (await createMedication(accessToken, name.trim(), instructions));
      if (!savedMedication) {
        medicationCreated = true;
        setSavedMedication(medication);
        onMedicationSaved(medication);
      }
      const schedule = await createMedicationSchedule(accessToken, medication.id, {
        cadence: 'daily',
        starts_on: todayInTimezone(timezone),
        times: normalizedTimes.map((localTime) => ({
          day_of_week: -1,
          local_time: `${localTime}:00`,
          meal_timing: null,
        })),
      });
      onComplete(medication, schedule);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? savedMedication || medicationCreated
            ? `The medication is saved, but its schedule could not be created: ${saveError.message}`
            : saveError.message
          : 'The medication or schedule could not be saved. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardView}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.backButton}>
          <Text style={styles.backText}>‹  Medications</Text>
        </Pressable>
        <Text style={styles.eyebrow}>ON-DEVICE SCAN</Text>
        <Text style={styles.title}>Add from prescription</Text>
        <Text style={styles.subtitle}>
          Choose a clear photo. Text recognition happens on this device; the image is not uploaded.
          Import one medication at a time and remove unrelated text from its instructions.
        </Text>

        {Platform.OS === 'web' ? (
          <View style={styles.notice}>
            <Text style={styles.body}>
              Prescription text recognition is available in the iOS and Android app.
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={reading || saving}
            onPress={() => void choosePrescription()}
            style={[styles.chooseButton, (reading || saving) && styles.disabled]}
          >
            <Text style={styles.chooseButtonText}>
              {reading ? 'Reading photo…' : imageUri ? 'Choose a different photo' : 'Choose prescription photo'}
            </Text>
          </Pressable>
        )}

        {imageUri ? <Image accessibilityLabel="Selected prescription" source={{ uri: imageUri }} style={styles.preview} /> : null}
        {reading ? (
          <View style={styles.notice}>
            <ActivityIndicator color="#1d4ed8" />
            <Text style={styles.body}>Reading text on this device…</Text>
          </View>
        ) : null}

        {recognizedText ? (
          <>
            <Text style={styles.sectionTitle}>Check the extracted details</Text>
            <Text style={styles.body}>
              OCR can misread medicine names, numbers, and handwriting. Compare every field with the original.
            </Text>
            <Text style={styles.inputLabel}>Medication name</Text>
            <TextInput
              accessibilityLabel="Medication name"
              editable={!savedMedication}
              onChangeText={(value) => {
                setName(value);
                setVerified(false);
              }}
              placeholder="Enter the name exactly as written"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={name}
            />
            <Text style={styles.inputLabel}>Instructions exactly as written</Text>
            <TextInput
              accessibilityLabel="Medication instructions"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!savedMedication}
              multiline
              onChangeText={(value) => {
                setInstructions(value);
                setVerified(false);
              }}
              placeholder="Review and correct the recognized text"
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.multilineInput]}
              textAlignVertical="top"
              value={instructions}
            />

            <Text style={styles.sectionTitle}>Daily reminder times</Text>
            <Text style={styles.body}>
              Times found in the text are suggestions only. Set a local time for each dose and verify it against the prescription.
            </Text>
            {frequencyUnclear ? (
              <Text style={styles.frequencyWarning}>
                No daily dose count or time was recognized. Choose the prescribed number of doses and enter every reminder time.
              </Text>
            ) : null}
            <View style={styles.countRow}>
              {[1, 2, 3].map((count) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: doseTimes.length === count }}
                  disabled={Boolean(savedMedication) || scheduleUnsupported}
                  key={count}
                  onPress={() => updateDoseCount(count)}
                  style={[
                    styles.countButton,
                    doseTimes.length === count && styles.selectedCountButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.countButtonText,
                      doseTimes.length === count && styles.selectedCountText,
                    ]}
                  >
                    {count} {count === 1 ? 'dose' : 'doses'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {doseTimes.map((localTime, index) => (
              <View key={index}>
                <Text style={styles.inputLabel}>Dose {index + 1} time (24-hour local time)</Text>
                <TextInput
                  accessibilityLabel={`Dose ${index + 1} time`}
                  editable={!savedMedication}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  onChangeText={(value) => {
                    setDoseTimes((current) =>
                      current.map((time, timeIndex) =>
                        timeIndex === index ? value : time,
                      ),
                    );
                    setVerified(false);
                    setError(null);
                  }}
                  placeholder="08:30"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={localTime}
                />
              </View>
            ))}
            {!savedMedication ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: verified }}
                onPress={() => setVerified((current) => !current)}
                style={styles.verifyRow}
              >
                <View style={[styles.checkbox, verified && styles.checkedBox]}>
                  {verified ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={styles.verifyText}>
                  I checked the medication details and each reminder time against the prescription.
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {recognizedText ? (
          <Pressable
            accessibilityRole="button"
            disabled={saving || reading || scheduleUnsupported}
            onPress={() => void saveMedicationAndSchedule()}
            style={[
              styles.saveButton,
              (saving || reading || scheduleUnsupported) && styles.disabled,
            ]}
          >
            <Text style={styles.saveButtonText}>
              {saving
                ? savedMedication
                  ? 'Creating schedule…'
                  : 'Saving medication…'
                : savedMedication
                  ? 'Retry schedule'
                  : 'Save medication and review schedule'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onCancel}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.disclaimer}>
          Medly does not interpret or verify prescriptions. The schedule remains inactive until you review and confirm it.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 600,
  },
  backButton: { alignSelf: 'flex-start', marginBottom: 24, paddingVertical: 8 },
  backText: { color: '#1d4ed8', fontSize: 15, fontWeight: '600' },
  eyebrow: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '700', lineHeight: 37 },
  subtitle: { color: '#64748b', fontSize: 15, lineHeight: 22, marginTop: 7, marginBottom: 18 },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 7 },
  body: { color: '#475569', fontSize: 14, lineHeight: 21 },
  frequencyWarning: {
    color: '#92400e',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 9,
  },
  chooseButton: {
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  chooseButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  preview: { alignSelf: 'center', height: 180, marginTop: 14, resizeMode: 'contain', width: '100%' },
  notice: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    padding: 15,
  },
  inputLabel: { color: '#334155', fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 18 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 11,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  multilineInput: { minHeight: 130, textAlignVertical: 'top' },
  countRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  countButton: {
    alignItems: 'center',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  selectedCountButton: { backgroundColor: '#eff6ff', borderColor: '#1d4ed8' },
  countButtonText: { color: '#475569', fontSize: 13, fontWeight: '600' },
  selectedCountText: { color: '#1d4ed8' },
  verifyRow: { alignItems: 'center', flexDirection: 'row', gap: 11, marginTop: 20 },
  checkbox: {
    alignItems: 'center',
    borderColor: '#94a3b8',
    borderRadius: 5,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkedBox: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  checkmark: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  verifyText: { color: '#334155', flex: 1, fontSize: 14, lineHeight: 20 },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, marginTop: 16, padding: 13 },
  errorText: { color: '#b91c1c', fontSize: 14, lineHeight: 20 },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  saveButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  cancelButton: { alignItems: 'center', marginTop: 12, paddingVertical: 12 },
  cancelText: { color: '#475569', fontSize: 15, fontWeight: '600' },
  disclaimer: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },
});
