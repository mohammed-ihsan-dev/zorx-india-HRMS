import { hasSessionHint, restoreSession } from './session.js';
import { DASHBOARD_PATHS } from '../features/attendance/attendanceBoot.js';

/**
 * Start-up session restore, started by main.jsx before React renders, so the
 * request is already on its way while the app's code is still loading.
 * On a dashboard it also asks for today's attendance in the same request.
 * AuthContext takes this promise (once) instead of starting its own request.
 */
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

let boot = null; // { promise, slow }
const slowListeners = new Set();

export function startSessionBoot(pathname = window.location.pathname) {
  if (!hasSessionHint() || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return null;
  boot = { slow: false, promise: null };
  const state = boot;
  state.promise = restoreSession({
    includeToday: DASHBOARD_PATHS.includes(pathname),
    onSlow: () => {
      state.slow = true;
      for (const fn of slowListeners) fn(true);
    },
  });
  state.promise.catch(() => {}); // handled by AuthContext
  return state.promise;
}

/** The start-up restore, once (null if none was started). */
export function takeSessionBoot() {
  const b = boot;
  boot = null;
  return b;
}

/** Notified when the start-up restore is slow (server waking up). */
export function onBootSlow(fn) {
  slowListeners.add(fn);
  return () => slowListeners.delete(fn);
}
