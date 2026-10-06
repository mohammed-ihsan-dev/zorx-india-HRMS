import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as authService from '../services/authService.js';

export const AuthContext = createContext(null);

const TOKEN_KEY = 'zorx_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when /auth/me could not be reached (network, 5xx, 429) — the session is
  // kept and the user can retry, rather than being logged out by a blip.
  const [authError, setAuthError] = useState(false);
  // Only the most recent hydration may apply its result, so a slow /auth/me for
  // a token another tab has since replaced can never overwrite the newer user.
  const latestLoadRef = useRef(0);

  const loadUser = useCallback(async () => {
    const loadId = ++latestLoadRef.current;
    setLoading(true);
    setAuthError(false);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await authService.getMe();
      if (loadId !== latestLoadRef.current) return;
      setUser(me);
    } catch (err) {
      if (loadId !== latestLoadRef.current) return;
      setUser(null);
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem(TOKEN_KEY);
      } else {
        setAuthError(true);
      }
    } finally {
      if (loadId === latestLoadRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // The token is shared by every tab via localStorage, but each tab resolves
  // its user only once. When another tab logs out or logs in as someone else,
  // re-resolve here so the UI identity always matches the token being sent.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === TOKEN_KEY || event.key === null) loadUser();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [loadUser]);

  const login = useCallback(async (email, password) => {
    const { token, user: loggedInUser } = await authService.login(email, password);
    latestLoadRef.current += 1;
    localStorage.setItem(TOKEN_KEY, token);
    setAuthError(false);
    setUser(loggedInUser);
    setLoading(false);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      latestLoadRef.current += 1;
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await authService.getMe();
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({ user, loading, authError, retryAuth: loadUser, login, logout, refreshUser }),
    [user, loading, authError, loadUser, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
