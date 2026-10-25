import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { setAccessTokenRefresher } from '../api/authenticatedRequest';
import {
  ApiError,
  AuthSession,
  User,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  register as registerRequest,
} from '../api/auth';
import {
  clearRefreshToken,
  getRefreshToken,
  saveRefreshToken,
} from './secureTokenStore';

type AuthStatus = 'loading' | 'signedOut' | 'authenticated' | 'expired' | 'error';

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  accessToken: string | null;
  sessionError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryRestore: () => Promise<void>;
  startNewSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  const applySession = useCallback(async (session: AuthSession) => {
    await saveRefreshToken(session.refresh_token);
    accessTokenRef.current = session.access_token;
    refreshTokenRef.current = session.refresh_token;
    setUser(session.user);
    setAccessToken(session.access_token);
    setRefreshToken(session.refresh_token);
    setSessionError(null);
    setStatus('authenticated');
  }, []);

  const refreshAuthenticatedAccessToken = useCallback(
    async (rejectedAccessToken: string): Promise<string> => {
      if (accessTokenRef.current && accessTokenRef.current !== rejectedAccessToken) {
        return accessTokenRef.current;
      }
      const currentRefreshToken = refreshTokenRef.current;
      if (!currentRefreshToken) {
        throw new Error('Your session could not be refreshed. Please sign in again.');
      }
      try {
        const session = await refreshSession(currentRefreshToken);
        await applySession(session);
        return session.access_token;
      } catch (refreshError) {
        if (refreshError instanceof ApiError && refreshError.status === 401) {
          await clearRefreshToken();
          accessTokenRef.current = null;
          refreshTokenRef.current = null;
          setUser(null);
          setAccessToken(null);
          setRefreshToken(null);
          setStatus('expired');
          setSessionError(null);
        }
        throw refreshError;
      }
    },
    [applySession],
  );

  useEffect(() => {
    setAccessTokenRefresher(refreshAuthenticatedAccessToken);
  }, [refreshAuthenticatedAccessToken]);

  const restoreSession = useCallback(async () => {
    setStatus('loading');
    setSessionError(null);
    try {
      const storedRefreshToken = await getRefreshToken();
      if (!storedRefreshToken) {
        accessTokenRef.current = null;
        refreshTokenRef.current = null;
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        setStatus('signedOut');
        return;
      }
      await applySession(await refreshSession(storedRefreshToken));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try {
          await clearRefreshToken();
          accessTokenRef.current = null;
          refreshTokenRef.current = null;
          setUser(null);
          setAccessToken(null);
          setRefreshToken(null);
          setStatus('expired');
        } catch (storageError) {
          setSessionError(errorMessage(storageError));
          setStatus('error');
        }
        return;
      }
      setSessionError(errorMessage(error));
      setStatus('error');
    }
  }, [applySession]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await applySession(await loginRequest(email, password));
    },
    [applySession],
  );

  const createAccount = useCallback(
    async (email: string, password: string) => {
      await applySession(await registerRequest(email, password));
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    const token = refreshToken ?? (await getRefreshToken());
    if (!token) {
      throw new Error('The saved session could not be found. Please try signing in again.');
    }
    await logoutRequest(token);
    await clearRefreshToken();
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setSessionError(null);
    setStatus('signedOut');
  }, [refreshToken]);

  const startNewSession = useCallback(async () => {
    await clearRefreshToken();
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setSessionError(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      accessToken,
      sessionError,
      signIn,
      createAccount,
      signOut,
      retryRestore: restoreSession,
      startNewSession,
    }),
    [
      accessToken,
      createAccount,
      restoreSession,
      sessionError,
      signIn,
      signOut,
      startNewSession,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
