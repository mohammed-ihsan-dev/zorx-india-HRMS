import axios from 'axios';

/**
 * Persistent sign-in for the browser.
 *
 *  - The refresh token lives ONLY in an httpOnly cookie set by the API (JavaScript
 *    can never read it). Opening the app calls POST /auth/refresh, which rotates it
 *    and returns a 15-minute access token + the user (and, at start-up, today's
 *    attendance so Check-in is usable after one request).
 *  - The access token is kept in memory only (this module), never in storage.
 *  - localStorage keeps one non-secret flag ("this browser has a session") so a
 *    signed-out visitor sees the login page at once instead of waiting for the
 *    server.
 *  - One refresh at a time per browser (Web Locks across tabs, single-flight per
 *    tab); a new token or a logout is shared with the other tabs (BroadcastChannel).
 *  - Session restore tolerates a sleeping server (Render Free cold start ≈ 30 s):
 *    long deadline, retries on network/5xx/503, and a "slow" callback for the UI.
 *  - A token saved by an app version from before this change (localStorage
 *    `zorx_token`) is moved once to a session via /auth/session/upgrade — only while
 *    it is still valid — and then deleted.
 */

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000/api';
export const SESSION_HINT_KEY = 'zorx_session';
export const LEGACY_TOKEN_KEY = 'zorx_token';
const LOCK_NAME = 'zorx-auth-refresh';
const RENEW_MARGIN_MS = 60_000;
export const BOOT_DEADLINE_MS = 100_000; // cold start + one retry, then show "try again"
export const RENEW_DEADLINE_MS = 60_000;
export const SLOW_AFTER_MS = 3_000;

const authHttp = axios.create({
  baseURL: API_URL,
  withCredentials: true, // the refresh cookie (api.zorxindia.online, path /api/auth)
  headers: { 'X-ZORX-Client': 'session', 'X-ZORX-CSRF': '1' },
});

let access = null; // { token, expiresAt (ms), userId }
let inFlight = null;
const listeners = new Set();

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};
const read = (k) => {
  try {
    return storage()?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v === null) storage()?.removeItem(k);
    else storage()?.setItem(k, v);
  } catch {
    // private mode / blocked storage: the in-memory session still works for this tab
  }
};

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('zorx-auth') : null;
channel?.unref?.(); // Node (tests) only: don't keep the process alive
channel?.addEventListener('message', ({ data }) => {
  if (data?.type === 'session' && data.token) {
    const sameUser = !access || access.userId === data.userId;
    if (sameUser) access = { token: data.token, expiresAt: data.expiresAt, userId: data.userId };
    else {
      access = null;
      emit('user-changed');
    }
  } else if (data?.type === 'logout') {
    access = null;
    emit('ended', { remote: true });
  }
});

function emit(event, detail) {
  for (const fn of listeners) {
    try {
      fn(event, detail);
    } catch {
      // a listener's failure never breaks the session module
    }
  }
}

/** Subscribe to 'ended' (signed out / session over) and 'user-changed' (another account signed in elsewhere). */
export function onSessionEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const userIdOf = (user) => (user ? String(user.id || user._id) : null);

/** The signed-in identity for this tab (used to never hand one user's data to another). */
export const currentIdentity = () => access?.userId || null;
export const getAccessToken = () => access?.token || null;
/** True when this browser probably has a session to restore (no secret is stored). */
export const hasSessionHint = () => read(SESSION_HINT_KEY) === '1' || Boolean(read(LEGACY_TOKEN_KEY));

const jwtExpiryMs = (token) => {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part)).exp * 1000;
  } catch {
    return Date.now() + 15 * 60 * 1000;
  }
};

/** Adopts a login / refresh / upgrade response. */
export function setSession(data) {
  const userId = userIdOf(data.user);
  // `token`: an API still on the previous version (a few minutes while a deploy rolls out).
  const token = data.accessToken || data.token;
  const expiresAt = data.accessTokenExpiresAt ? new Date(data.accessTokenExpiresAt).getTime() : jwtExpiryMs(token);
  access = { token, expiresAt, userId };
  write(SESSION_HINT_KEY, '1');
  write(LEGACY_TOKEN_KEY, null);
  channel?.postMessage({ type: 'session', token: access.token, expiresAt: access.expiresAt, userId });
}

/** Forgets the session in this browser (all tabs). */
export function clearSession({ broadcast = true } = {}) {
  access = null;
  write(SESSION_HINT_KEY, null);
  write(LEGACY_TOKEN_KEY, null);
  if (broadcast) channel?.postMessage({ type: 'logout' });
}

const withLock = (fn) =>
  typeof navigator !== 'undefined' && navigator.locks?.request ? navigator.locks.request(LOCK_NAME, fn) : fn();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const statusOf = (err) => err?.response?.status;
/** Worth retrying: no response (network, timeout, sleeping server) or a temporary server error. */
export const isTransient = (err) => !err?.response || [429, 500, 502, 503, 504].includes(statusOf(err));

async function postWithDeadline(url, deadline, config = {}) {
  let attempt = 0;
  for (;;) {
    const remaining = deadline - Date.now();
    try {
      return await authHttp.post(url, null, { ...config, timeout: Math.max(5_000, Math.min(remaining, 60_000)) });
    } catch (err) {
      attempt += 1;
      const wait = Math.min(2_000 * attempt, 8_000);
      if (!isTransient(err) || Date.now() + wait >= deadline) throw err;
      await sleep(wait);
    }
  }
}

/**
 * Restores (or renews) the session from the refresh cookie.
 * Resolves to the server's data ({ accessToken, user, today? }) or null when there
 * is no session (signed out). Rejects only when the server could not be reached in
 * time — the caller keeps the user signed in and offers "Try again".
 */
export function restoreSession({ includeToday = false, deadlineMs = BOOT_DEADLINE_MS, onSlow } = {}) {
  if (inFlight) return inFlight;
  const slowTimer = onSlow ? setTimeout(() => onSlow(), SLOW_AFTER_MS) : null;
  inFlight = withLock(async () => {
    const deadline = Date.now() + deadlineMs;
    try {
      const { data } = await postWithDeadline(`/auth/refresh${includeToday ? '?include=today' : ''}`, deadline);
      setSession(data.data);
      return data.data;
    } catch (err) {
      if (isTransient(err)) throw err;
      // 401/403: no usable session cookie. A token saved by an older app version may still be moved over.
      const legacy = read(LEGACY_TOKEN_KEY);
      if (legacy) {
        try {
          const { data } = await postWithDeadline('/auth/session/upgrade', deadline, { headers: { Authorization: `Bearer ${legacy}` } });
          setSession(data.data);
          return data.data;
        } catch (upgradeErr) {
          if (isTransient(upgradeErr)) throw upgradeErr;
        }
      }
      clearSession({ broadcast: false });
      return null;
    }
  }).finally(() => {
    if (slowTimer) clearTimeout(slowTimer);
    inFlight = null;
  });
  return inFlight;
}

/**
 * A valid access token for an API call: the current one, or a renewed one when it
 * expires within a minute. null when signed out.
 */
export async function ensureAccessToken() {
  if (access && access.expiresAt - Date.now() > RENEW_MARGIN_MS) return access.token;
  if (!access && !hasSessionHint()) return null;
  const renewed = await renewAccessToken();
  return renewed;
}

/** Forces a renewal (after a 401 TOKEN_EXPIRED). Returns the new token or null (session over). */
export async function renewAccessToken() {
  const before = access?.token;
  // Another tab may have renewed it while this one waited for the lock.
  const data = await withLock(async () => {
    if (access && access.token !== before && access.expiresAt - Date.now() > RENEW_MARGIN_MS) return { reused: true };
    return null;
  });
  if (data?.reused) return access.token;
  const restored = await restoreSession({ deadlineMs: RENEW_DEADLINE_MS });
  if (!restored) emit('ended', { remote: false });
  return restored ? access.token : null;
}

/** POST /auth/login (sets the refresh cookie). */
export async function loginRequest(email, password) {
  const { data } = await authHttp.post('/auth/login', { email, password }, { timeout: 75_000 });
  setSession(data.data);
  return data.data;
}

/** POST /auth/logout: ends this browser's session on the server, then forgets it everywhere. */
export async function logoutRequest() {
  try {
    await authHttp.post('/auth/logout', null, { timeout: 15_000 });
  } finally {
    clearSession();
  }
}

/** Test-only reset. */
export function _resetSession() {
  access = null;
  inFlight = null;
  listeners.clear();
}

/** Test-only: the HTTP client used for the session endpoints. */
export const _authHttp = authHttp;
