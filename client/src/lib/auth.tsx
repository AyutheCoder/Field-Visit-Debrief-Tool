import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAuthToken } from './api';
import type { Role, User } from '../types';

const TOKEN_KEY = 'fvd.auth.token';

interface AuthState {
  user: User | null;
  /** True while restoring a saved session on first load. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** True if the current user holds any of the given roles. */
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a saved token on first load.
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }
    setAuthToken(saved);
    api
      .me()
      .then((res: any) => setUser(res.user))
      .catch(() => {
        // Token expired or invalid - clear it.
        setAuthToken(null);
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setAuthToken(res.token);
    localStorage.setItem(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user]
  );

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout, hasRole }),
    [user, loading, login, logout, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
