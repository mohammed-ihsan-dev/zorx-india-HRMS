/**
 * Attendance-first start-up.
 *
 * Before: open app → download app → /auth/me → download the Dashboard code →
 * only THEN ask for today's attendance (three network waits in a row).
 * Now, when a signed-in user opens a dashboard, today's attendance (and WFH)
 * is requested at boot, in parallel with /auth/me and the Dashboard code.
 *
 * Nothing is trusted from here that the server did not say: these are the same
 * authenticated requests the dashboard makes (the server checks the token), and
 * the result is handed to the dashboard only if it belongs to the SAME token and
 * is fresh. A failed early load is simply retried by the dashboard as normal.
 *
 * It also holds secondary dashboard requests (tasks, announcements,
 * notifications) until attendance has loaded — capped, so they are never
 * blocked for long — so on a slow phone connection the Check-in data goes first.
 */

const TOKEN_KEY = 'zorx_token';
export const EARLY_MAX_AGE_MS = 20_000;
export const SECONDARY_MAX_WAIT_MS = 4_000;
export const DASHBOARD_PATHS = Object.freeze(['/', '/admin']);

let early = null; // { token, at, promise }
let gate = null; // Promise resolved when attendance has settled (or the cap passes)
let releaseGate = null;

function armGate(maxWaitMs) {
  gate = new Promise((resolve) => {
    releaseGate = resolve;
    setTimeout(resolve, maxWaitMs);
  });
}

/** Starts the early attendance load (`load`) for a signed-in user opening a dashboard. Returns whether it did. */
export function startAttendanceBoot({ pathname = window.location.pathname, storage = window.localStorage, load, maxWaitMs = SECONDARY_MAX_WAIT_MS } = {}) {
  let token = null;
  try {
    token = storage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
  if (!token || !DASHBOARD_PATHS.includes(pathname)) return false;
  const promise = load(); // [attendance today, WFH today] — the same requests the dashboard makes
  promise.catch(() => {}); // a failure is handled by the dashboard's own load
  early = { token, at: Date.now(), promise, storage };
  armGate(maxWaitMs);
  return true;
}

/**
 * The early result, once, for the dashboard's first load — or null when there is
 * none, it is stale, or the signed-in token has changed since (another user).
 */
export function takeEarlyAttendance(now = Date.now()) {
  const e = early;
  early = null;
  if (!e) return null;
  let token = null;
  try {
    token = e.storage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
  if (token !== e.token || now - e.at > EARLY_MAX_AGE_MS) return null;
  return e.promise;
}

/** Called by the attendance hook when its first load has finished (success or failure). */
export function markAttendanceSettled() {
  releaseGate?.();
}

/** Secondary dashboard requests await this. Resolves at once when no attendance-first start is active. */
export function afterAttendance() {
  return gate || Promise.resolve();
}

/** Test-only reset. */
export function _resetAttendanceBoot() {
  early = null;
  gate = null;
  releaseGate = null;
}
