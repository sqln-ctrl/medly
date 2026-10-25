import { authenticatedRequest } from './authenticatedRequest';

export type Medication = {
  id: string;
  patient_id: string;
  name: string;
  instruction_text: string;
  created_at: string;
};

export type PatientProfile = {
  user_id: string;
  timezone: string;
  created_at: string;
};

async function request<TResponse>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<TResponse> {
  return authenticatedRequest<TResponse>(path, accessToken, init);
}

export function listMedications(accessToken: string): Promise<Medication[]> {
  return request<Medication[]>('/medications', accessToken);
}

export function getPatientProfile(accessToken: string): Promise<PatientProfile> {
  return request<PatientProfile>('/patients/me', accessToken);
}

export function createMedication(
  accessToken: string,
  name: string,
  instructionText: string,
): Promise<Medication> {
  return request<Medication>('/medications', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name,
      instruction_text: instructionText,
    }),
  });
}

export function archiveMedication(
  accessToken: string,
  medicationId: string,
): Promise<void> {
  return request<void>(`/medications/${medicationId}`, accessToken, {
    method: 'DELETE',
  });
}
