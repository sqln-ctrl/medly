import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

  const applySession = useCallback(async (session: AuthSession) => {
    await saveRefreshToken(session.refresh_token);
    setUser(session.user);
    setAccessToken(session.access_token);
    setRefreshToken(session.refresh_token);
    setSessionError(null);
    setStatus('authenticated');
  }, []);

  const restoreSession = useCallback(async () => {
    setStatus('loading');
    setSessionError(null);
    try {
      const storedRefreshToken = await getRefreshToken();
      if (!storedRefreshToken) {
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
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setSessionError(null);
    setStatus('signedOut');
  }, [refreshToken]);

  const startNewSession = useCallback(async () => {
    await clearRefreshToken();
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
