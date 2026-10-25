const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

type AccessTokenRefresher = (rejectedAccessToken: string) => Promise<string>;

let accessTokenRefresher: AccessTokenRefresher | null = null;
let refreshInFlight: Promise<string> | null = null;

export function setAccessTokenRefresher(refresher: AccessTokenRefresher): void {
  accessTokenRefresher = refresher;
}

async function refreshAccessToken(rejectedAccessToken: string): Promise<string> {
  if (!accessTokenRefresher) {
    throw new Error('Your session could not be refreshed. Please sign in again.');
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = accessTokenRefresher(rejectedAccessToken).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function sendRequest(
  path: string,
  accessToken: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
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
}

export async function authenticatedRequest<TResponse>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<TResponse> {
  let response = await sendRequest(path, accessToken, init);
  if (response.status === 401) {
    const freshAccessToken = await refreshAccessToken(accessToken);
    response = await sendRequest(path, freshAccessToken, init);
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
