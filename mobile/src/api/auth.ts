const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export type User = {
  id: string;
  email: string;
};

export type AuthSession = {
  user: User;
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  refresh_token: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function post<TResponse>(path: string, body: unknown): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
        : response.status === 429
          ? 'Too many attempts. Please wait a moment and try again.'
          : 'The request could not be completed. Please try again.';
    throw new ApiError(response.status, detail);
  }

  return responseBody as TResponse;
}

export function register(email: string, password: string): Promise<AuthSession> {
  return post<AuthSession>('/auth/register', { email, password });
}

export function login(email: string, password: string): Promise<AuthSession> {
  return post<AuthSession>('/auth/login', { email, password });
}

export function refreshSession(refreshToken: string): Promise<AuthSession> {
  return post<AuthSession>('/auth/refresh', { refresh_token: refreshToken });
}

export async function logout(refreshToken: string): Promise<void> {
  await post<void>('/auth/logout', { refresh_token: refreshToken });
}
