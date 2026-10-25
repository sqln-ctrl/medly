import { authenticatedRequest } from './authenticatedRequest';

export type ScheduleTime = {
  day_of_week: number;
  local_time: string;
  meal_timing?:
    | 'before_breakfast'
    | 'after_breakfast'
    | 'before_lunch'
    | 'after_lunch'
    | 'before_dinner'
    | 'after_dinner'
    | null;
};

export type MedicationSchedule = {
  id: string;
  medication_id: string;
  cadence: 'daily' | 'weekly' | 'interval';
  starts_on: string;
  ends_on: string | null;
  interval_days: number | null;
  confirmed_at: string | null;
  enabled_at: string | null;
  created_at: string;
  times: ScheduleTime[];
};

export type UpcomingDose = {
  schedule_id: string;
  medication_id: string;
  medication_name: string;
  scheduled_for: string;
  status: 'taken' | 'skipped' | 'missed' | null;
};

export type UpcomingDoses = {
  timezone: string;
  start_date: string;
  end_date: string;
  doses: UpcomingDose[];
};

export type DoseStatus = 'taken' | 'skipped' | 'missed';

export type DoseReport = {
  id: string;
  schedule_id: string;
  medication_id: string;
  medication_name: string;
  scheduled_for: string;
  status: DoseStatus;
  reported_at: string;
};

export type DoseHistory = {
  timezone: string;
  start_date: string;
  end_date: string;
  events: DoseReport[];
};

export type MedicationAdherenceSummary = {
  medication_id: string;
  medication_name: string;
  taken: number;
  skipped: number;
  missed: number;
  total_reported: number;
  reported_taken_percentage: number | null;
};

export type DoseAdherence = {
  timezone: string;
  start_date: string;
  end_date: string;
  total_reported: number;
  taken: number;
  skipped: number;
  missed: number;
  reported_taken_percentage: number | null;
  medications: MedicationAdherenceSummary[];
};

async function request<TResponse>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<TResponse> {
  return authenticatedRequest<TResponse>(path, accessToken, init);
}

export function listMedicationSchedules(
  accessToken: string,
  medicationId: string,
): Promise<MedicationSchedule[]> {
  return request<MedicationSchedule[]>(
    `/medications/${medicationId}/schedules`,
    accessToken,
  );
}

export function createMedicationSchedule(
  accessToken: string,
  medicationId: string,
  schedule: {
    cadence: MedicationSchedule['cadence'];
    starts_on: string;
    ends_on?: string | null;
    interval_days?: number;
    times: ScheduleTime[];
  },
): Promise<MedicationSchedule> {
  return request<MedicationSchedule>(
    `/medications/${medicationId}/schedules`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(schedule),
    },
  );
}

export function confirmMedicationSchedule(
  accessToken: string,
  scheduleId: string,
): Promise<MedicationSchedule> {
  return request<MedicationSchedule>(`/schedules/${scheduleId}/confirm`, accessToken, {
    method: 'POST',
  });
}

export function archiveMedicationSchedule(
  accessToken: string,
  scheduleId: string,
): Promise<void> {
  return request<void>(`/schedules/${scheduleId}`, accessToken, {
    method: 'DELETE',
  });
}

export function getUpcomingDoses(
  accessToken: string,
  days = 7,
): Promise<UpcomingDoses> {
  return request<UpcomingDoses>(`/doses/upcoming?days=${days}`, accessToken);
}

export function reportDose(
  accessToken: string,
  dose: UpcomingDose,
  status: DoseStatus,
): Promise<DoseReport> {
  return request<DoseReport>('/doses/report', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      schedule_id: dose.schedule_id,
      scheduled_for: dose.scheduled_for,
      status,
    }),
  });
}

export function getDoseHistory(accessToken: string): Promise<DoseHistory> {
  return request<DoseHistory>('/doses/history', accessToken);
}

export function getDoseAdherence(accessToken: string): Promise<DoseAdherence> {
  return request<DoseAdherence>('/doses/adherence', accessToken);
}
