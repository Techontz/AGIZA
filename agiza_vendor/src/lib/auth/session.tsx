import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, setSessionExpiredHandler } from '../api/client';
import { accountApi } from '../api/endpoints';
import type { Customer, Session } from '../api/types';
import { registerForPush, unregisteredDeviceToken } from '../push';
import { tokenStore } from './token-store';

type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  customer: Customer | null;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
  setCustomer: (customer: Customer) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [customer, setCustomer] = useState<Customer | null>(null);

  const reset = useCallback(() => {
    setCustomer(null);
    setStatus('signedOut');
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(reset);
    (async () => {
      if (!(await tokenStore.getRefresh())) return setStatus('signedOut');
      // Open the app straight away with the stored session; the profile loads in the background,
      // so a slow network never keeps the seller on the splash screen.
      setStatus('signedIn');
      try {
        setCustomer(await accountApi.me());
        registerForPush();
      } catch (e) {
        // Offline: keep the session (screens show their own connection errors). Rejected: sign out.
        if (!(e instanceof ApiError && e.isNetwork)) reset();
      }
    })();
  }, [reset]);

  const signIn = useCallback(async (session: Session) => {
    await tokenStore.save(session.access, session.refresh);
    queryClient.clear();
    setCustomer(session.customer);
    setStatus('signedIn');
    registerForPush();
  }, [queryClient]);

  const signOut = useCallback(async () => {
    const refresh = await tokenStore.getRefresh();
    await accountApi.logout(refresh, unregisteredDeviceToken()).catch(() => undefined);
    await tokenStore.clear();
    reset();
  }, [reset]);

  const value = useMemo(() => ({ status, customer, signIn, signOut, setCustomer }), [status, customer, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
