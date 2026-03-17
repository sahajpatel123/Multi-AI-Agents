import {
  createElement,
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  getMe,
  refreshSession,
} from '../api';
import { User } from '../types';

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface UseAuth extends AuthState {
  setUser: Dispatch<SetStateAction<User | null>>;
  setIsAuthenticated: Dispatch<SetStateAction<boolean>>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<UseAuth | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Auth refresh timed out')), 5000)
      );

      const user = await Promise.race([
        getMe(),
        timeoutPromise
      ]);

      if (user) {
        setUser(user);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.log('[AUTH] User refresh failed, keeping current session state', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const nextUser = await apiLogin(email, password);
    setUser(nextUser);
    setIsAuthenticated(true);
    setIsLoading(false);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const nextUser = await apiRegister(email, password);
    setUser(nextUser);
    setIsAuthenticated(true);
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setIsAuthenticated(false);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const refreshInterval = setInterval(async () => {
      const result = await refreshSession();

      if (result === 'unauthorized') {
        console.log('[AUTH] Refresh failed, logging out');
        await logout();
        return;
      }

      if (result === 'network_error') {
        console.log('[AUTH] Refresh network error, keeping session');
      }
    }, 45 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [isAuthenticated, logout]);

  const value = useMemo<UseAuth>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      setUser,
      setIsAuthenticated,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, isAuthenticated, isLoading, login, logout, refreshUser, register],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): UseAuth {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
