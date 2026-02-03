import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { Session } from '@crm/api';
import { mobileStorage } from '@crm/api/storage/mobile';
import { authApi, setUnauthorizedCallback } from './api';

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    setUnauthorizedCallback(() => {
      setSession(null);
      router.replace('/login');
    });

    const initSession = async () => {
      const token = await mobileStorage.getToken();
      if (token) {
        try {
          const me = await authApi.me();
          setSession({ ...me, accessToken: token });
        } catch (error) {
          console.error('Failed to restore session:', error);
          await mobileStorage.clearToken();
        }
      }
      setLoading(false);
    };

    initSession();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [session, segments, loading]);

  const login = async (email: string, password: string) => {
    const { accessToken } = await authApi.login({ email, password });
    await mobileStorage.setToken(accessToken);

    const me = await authApi.me();

    if (me.scope !== 'tenant') {
      await mobileStorage.clearToken();
      throw new Error('Conta admin não pode acessar app mobile');
    }

    const newSession = { ...me, accessToken };
    setSession(newSession);
  };

  const logout = async () => {
    await mobileStorage.clearToken();
    setSession(null);
    router.replace('/login');
  };

  return (
    <SessionContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
