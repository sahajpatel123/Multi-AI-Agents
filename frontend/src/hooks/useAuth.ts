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
import { useNavigate } from 'react-router-dom';
import {
  AUTH_LOGOUT_EVENT,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  getMe,
  refreshSession,
} from '../api';
import { User } from '../types';
import { clearRedirectIntent, getRedirectIntent, setRedirectIntent } from '../utils/redirectIntent';

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
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuthState = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    setIsLoading(false);
  }, []);

  const redirectToSignIn = useCallback(() => {
    if (typeof window === 'undefined' || window.location.pathname === '/signin') return;
    setRedirectIntent(`${window.location.pathname}${window.location.search}`);
    navigate('/signin', { replace: true });
  }, [navigate]);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);

    try {
      const currentUser = await getMe();
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
        return;
      }

      const refreshed = await refreshSession();
      if (!refreshed) {
        clearAuthState();
        return;
      }

      const refreshedUser = await getMe();
      if (refreshedUser) {
        setUser(refreshedUser);
        setIsAuthenticated(true);
        return;
      }

      clearAuthState();
    } catch (error) {
      console.log('[AUTH] Auth bootstrap failed, clearing session state', error);
      clearAuthState();
    } finally {
      setIsLoading(false);
    }
  }, [clearAuthState]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const nextUser = await apiLogin(email, password);
      setUser(nextUser);
      setIsAuthenticated(true);
      const intent = getRedirectIntent();
      clearRedirectIntent();
      navigate(intent || '/agent', { replace: true });
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const register = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const nextUser = await apiRegister(email, password);
      setUser(nextUser);
      setIsAuthenticated(true);
      navigate('/agent', { replace: true });
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Best effort only; backend handles cookie clearing when reachable.
    }
    clearAuthState();
    redirectToSignIn();
  }, [clearAuthState, redirectToSignIn]);

  useEffect(() => {
    const handleLogout = (event: Event) => {
      clearAuthState();
      const detail = (event as CustomEvent<{ redirect?: boolean }>).detail;
      if (detail?.redirect === false) return;
      navigate('/signin', { replace: true });
    };

    window.addEventListener(AUTH_LOGOUT_EVENT, handleLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleLogout);
  }, [clearAuthState, navigate]);

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
