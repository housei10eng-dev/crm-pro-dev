import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from './api';

interface Session {
  id: string;
  email: string;
  name: string;
  tenantId: string | null;
  scope: 'admin' | 'tenant' | string;
  accessToken: string;
}

const webStorage = {
  getToken: () => localStorage.getItem('token'),
  setToken: (token: string) => localStorage.setItem('token', token),
  clearToken: () => localStorage.removeItem('token'),
};

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
  const navigate = useNavigate();

  useEffect(() => {
    const initSession = async () => {
      const token = webStorage.getToken();
      if (token) {
        try {
          const { data: me } = await authApi.me();
          setSession({ ...me, accessToken: token });
        } catch (error) {
          console.error('Failed to restore session:', error);
          webStorage.clearToken();
        }
      }
      setLoading(false);
    };

    initSession();
  }, [navigate]);

  const login = async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    const { accessToken } = data;
    webStorage.setToken(accessToken);

    const { data: me } = await authApi.me();
    const newSession = { ...me, accessToken };
    setSession(newSession);

    // Redirect based on scope
    if (me.scope === 'admin') {
      navigate('/admin/dashboard');
    } else {
      // Admin web should not allow tenant users
      webStorage.clearToken();
      setSession(null);
      throw new Error('Conta de tenant não pode acessar o console admin');
    }
  };

  const logout = () => {
    webStorage.clearToken();
    setSession(null);
    navigate('/login');
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
