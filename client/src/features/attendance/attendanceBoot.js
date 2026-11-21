/**
 * Attendance-first start-up.
 *
 * Opening the app used to wait for: app code → /auth/me → Dashboard code → today's
 * attendance (network waits in a row). Now, when a signed-in user opens a
 * dashboard, one request restores the session AND returns today's attendance
 * (/auth/refresh?include=today, started in main.jsx before React renders), in
 * parallel with downloading the Dashboard code.
 *
 * Nothing is trusted that the server did not say: the result is handed to the
 * dashboard only for the SAME signed-in account and only while fresh. A failed
 * early load is simply retried by the dashboard as normal.
 *
 * It also holds secondary dashboard requests (tasks, announcements,
 * notifications) until attendance has loaded — capped, so they are never
 * blocked for long — so on a slow phone connection the Check-in data goes first.
 */

export const EARLY_MAX_AGE_MS = 20_000;
export const SECONDARY_MAX_WAIT_MS = 4_000;
export const DASHBOARD_PATHS = Object.freeze(['/', '/admin']);

let early = null; // { at, promise, identity }
let gate = null; // Promise resolved when attendance has settled (or the cap passes)
let releaseGate = null;

function armGate(maxWaitMs) {
  gate = new Promise((resolve) => {
    releaseGate = resolve;
    setTimeout(resolve, maxWaitMs);
  });
}

/**
 * Starts the early attendance load for a signed-in user opening a dashboard.
 * `load()` resolves to { identity, value } — value = [attendance today, WFH today];
 * `identity()` is the account signed in now. Returns whether it started.
 */
export function startAttendanceBoot({ pathname = window.location.pathname, signedIn, identity, load, maxWaitMs = SECONDARY_MAX_WAIT_MS } = {}) {
  if (!signedIn || !DASHBOARD_PATHS.includes(pathname)) return false;
  const promise = Promise.resolve().then(load);
  promise.catch(() => {}); // a failure is handled by the dashboard's own load
  early = { at: Date.now(), promise, identity };
  armGate(maxWaitMs);
  return true;
}

/**
 * The early result, once, for the dashboard's first load — or null when there is
 * none or it is stale. Rejects (so the dashboard reloads) if it belongs to a
 * different account than the one signed in now.
 */
export function takeEarlyAttendance(now = Date.now()) {
  const e = early;
  early = null;
  if (!e || now - e.at > EARLY_MAX_AGE_MS) return null;
  return e.promise.then((r) => {
    if (!r?.identity || r.identity !== e.identity()) throw new Error('early attendance belongs to another session');
    return r.value;
  });
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
