import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as authService from '../services/authService.js';
import { setCacheOwner } from '../services/readCache.js';
import { hasSessionHint, onSessionEvent, restoreSession, SESSION_HINT_KEY, LEGACY_TOKEN_KEY } from '../services/session.js';
import { takeSessionBoot, onBootSlow } from '../services/sessionBoot.js';

export const AuthContext = createContext(null);

/**
 * Who is signed in. The session itself lives in services/session.js (httpOnly
 * refresh cookie + in-memory access token, up to 30 days).
 *
 * States: `loading` (restoring the session), `connecting` (restoring is taking
 * long — usually the server waking up), `authError` (server unreachable: the
 * session is KEPT and the user can retry; a network blip never signs anyone out).
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => hasSessionHint());
  const [connecting, setConnecting] = useState(false);
  const [authError, setAuthError] = useState(false);
  // Only the most recent restore may apply its result.
  const latestLoadRef = useRef(0);

  const applyRestore = useCallback(async (promise) => {
    const loadId = ++latestLoadRef.current;
    setLoading(true);
    setAuthError(false);
    try {
      const restored = await promise;
      if (loadId !== latestLoadRef.current) return;
      setUser(restored?.user || null);
    } catch {
      if (loadId !== latestLoadRef.current) return;
      setUser(null);
      setAuthError(true);
    } finally {
      if (loadId === latestLoadRef.current) {
        setLoading(false);
        setConnecting(false);
      }
    }
  }, []);

  const loadUser = useCallback(() => {
    if (!hasSessionHint()) {
      latestLoadRef.current += 1;
      setUser(null);
      setLoading(false);
      setAuthError(false);
      return Promise.resolve();
    }
    return applyRestore(restoreSession({ onSlow: () => setConnecting(true) }));
  }, [applyRestore]);

  // Start-up: use the restore main.jsx already started (or start one).
  useEffect(() => {
    const boot = takeSessionBoot();
    if (!boot) {
      loadUser();
      return undefined;
    }
    if (boot.slow) setConnecting(true);
    const off = onBootSlow(() => setConnecting(true));
    applyRestore(boot.promise);
    return off;
  }, [applyRestore, loadUser]);

  // Other tabs: logout everywhere / another account signed in → follow along.
  useEffect(
    () =>
      onSessionEvent((event) => {
        if (event === 'ended') {
          latestLoadRef.current += 1;
          setUser(null);
          setLoading(false);
        } else if (event === 'user-changed') {
          loadUser();
        }
      }),
    [loadUser]
  );

  // Browsers without BroadcastChannel: the session flag in localStorage changing.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === SESSION_HINT_KEY || event.key === LEGACY_TOKEN_KEY || event.key === null) {
        if (!hasSessionHint()) {
          latestLoadRef.current += 1;
          setUser(null);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Back online after a failed restore: try again by itself.
  useEffect(() => {
    if (!authError) return undefined;
    const retry = () => loadUser();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [authError, loadUser]);

  const login = useCallback(async (email, password) => {
    const { user: loggedInUser } = await authService.login(email, password);
    latestLoadRef.current += 1;
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
      setUser(null);
      setLoading(false);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await authService.logoutAll();
    } finally {
      latestLoadRef.current += 1;
      setUser(null);
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await authService.getMe();
    setUser(me);
    return me;
  }, []);

  // Cached reference data belongs to exactly one signed-in account: a different
  // user (or logout) clears it before anything can be read (services/readCache.js).
  useEffect(() => {
    setCacheOwner(user ? `${user.id || user._id}|${user.role}` : null);
  }, [user]);

  const value = useMemo(
    () => ({ user, loading, connecting, authError, retryAuth: loadUser, login, logout, logoutAll, refreshUser }),
    [user, loading, connecting, authError, loadUser, login, logout, logoutAll, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
