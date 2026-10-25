const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export type ScheduleTime = {
  day_of_week: number;
  local_time: string;
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

async function request<TResponse>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error('Could not reach the Medly server. Check your connection and try again.');
  }

  const responseText = await response.text();
  let responseBody: unknown;
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      if (response.ok) {
        throw new Error('The server returned an invalid response.');
      }
    }
  }

  if (!response.ok) {
    const detail =
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'detail' in responseBody &&
      typeof responseBody.detail === 'string'
        ? responseBody.detail
        : 'The request could not be completed. Please try again.';
    throw new Error(detail);
  }

  return responseBody as TResponse;
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
