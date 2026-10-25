const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

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
