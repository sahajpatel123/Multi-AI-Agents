import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/apiFetch';
import { clearTokens, getAccessToken, setTokens } from '../lib/tokenStorage';
import type { User } from '../types';
import { clearRedirectIntent, getRedirectIntent } from '../utils/redirectIntent';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

function parseLoginRegisterError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const d = data as { detail?: unknown };
  const detail = d.detail;
  if (typeof detail === 'string') return detail || fallback;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const m = (detail as { message?: string }).message;
    if (typeof m === 'string') return m || fallback;
  }
  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const r = await apiFetch('/api/auth/me', { skipAuthRefresh: true });
      if (r.ok) {
        setUser((await r.json()) as User);
      } else {
        clearTokens();
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const token = getAccessToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const r = await apiFetch('/api/auth/me');
        if (r.ok) {
          setUser((await r.json()) as User);
        } else {
          clearTokens();
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, []);

  useEffect(() => {
    function onExpired() {
      clearTokens();
      setUser(null);
      navigate('/signin');
    }
    window.addEventListener('auth:session-expired', onExpired);
    return () => window.removeEventListener('auth:session-expired', onExpired);
  }, [navigate]);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(parseLoginRegisterError(err, 'Login failed'));
      }

      const data = (await r.json()) as {
        access_token: string;
        refresh_token: string;
        user: User;
      };

      setTokens(data.access_token, data.refresh_token);
      setUser(data.user);

      const intent = getRedirectIntent();
      clearRedirectIntent();
      navigate(intent || '/agent');
    },
    [navigate],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const r = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(parseLoginRegisterError(err, 'Registration failed'));
      }

      const data = (await r.json()) as {
        access_token: string;
        refresh_token: string;
        user: User;
      };

      setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      navigate('/agent');
    },
    [navigate],
  );

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      skipAuthRefresh: true,
    }).catch(() => {});
    clearTokens();
    setUser(null);
    navigate('/signin');
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isLoading: loading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
