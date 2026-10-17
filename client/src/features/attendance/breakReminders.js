// Break reminders: informational only. Reads the server-recorded start time of
// the active break; never ends a break or changes attendance data.

// Timed against the DAILY break allowance (60 min shared by all breaks), not
// each break on its own.
export const BREAK_REMINDER = {
  ENDING_SOON: 'ENDING_SOON', // 5 min of the daily allowance left
  TIME_OVER: 'TIME_OVER', // daily allowance used up
};

export const WARNING_BEFORE_MS = 5 * 60 * 1000;

const STORE_PREFIX = 'zorx:breakReminder:';
export const DEFAULT_BREAK_ALLOWANCE_MINUTES = 60;

const toMs = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Daily break allowance usage — the End Break countdown's calculation, shared
 * so the countdown and the reminders can never disagree. Completed breaks count
 * end − start; the open (last, un-ended) break counts up to `nowMs`. Invalid
 * timestamps count as 0. Remaining time never goes below 0.
 */
export function breakAllowanceUsage(record, nowMs, allowanceMinutes = DEFAULT_BREAK_ALLOWANCE_MINUTES) {
  const allowanceMs = (allowanceMinutes || DEFAULT_BREAK_ALLOWANCE_MINUTES) * 60 * 1000;
  const breaks = record?.breaks || [];
  let completedMs = 0;
  for (const b of breaks) {
    if (b?.startTime && b.endTime) {
      const start = toMs(b.startTime);
      const end = toMs(b.endTime);
      if (start !== null && end !== null) completedMs += Math.max(0, end - start);
    }
  }
  const last = breaks[breaks.length - 1];
  const activeStart = last && !last.endTime ? toMs(last.startTime) : null;
  const activeMs = activeStart === null ? 0 : Math.max(0, nowMs - activeStart);
  const usedMs = completedMs + activeMs;
  return { allowanceMs, completedMs, activeMs, usedMs, remainingMs: Math.max(0, allowanceMs - usedMs) };
}

/**
 * The open (un-ended) break of a not-yet-checked-out record, or null. Invalid
 * timestamps → null. `exhaustAtMs` is when the daily allowance runs out during
 * this break: start + whatever allowance the earlier completed breaks left.
 */
export function getActiveBreakSession(record, allowanceMinutes = DEFAULT_BREAK_ALLOWANCE_MINUTES) {
  if (!record?.checkIn || record.checkOut) return null;
  const last = record.breaks?.[record.breaks.length - 1];
  if (!last || last.endTime || !last.startTime) return null;
  const startMs = toMs(last.startTime);
  if (startMs === null) return null;
  const { allowanceMs, completedMs } = breakAllowanceUsage(record, startMs, allowanceMinutes);
  const remainingAtStartMs = Math.max(0, allowanceMs - completedMs);
  return { startMs, key: new Date(startMs).toISOString(), remainingAtStartMs, exhaustAtMs: startMs + remainingAtStartMs };
}

/**
 * The single reminder that should show now, or null. Once the allowance is used
 * up only TIME_OVER is relevant — a missed 5-minute warning is not replayed.
 */
export function dueReminder(session, nowMs) {
  const remaining = session.exhaustAtMs - Math.max(nowMs, session.startMs);
  if (remaining <= 0) return BREAK_REMINDER.TIME_OVER;
  if (remaining <= WARNING_BEFORE_MS) return BREAK_REMINDER.ENDING_SOON;
  return null;
}

/** Remembers which reminders were shown per user + break, surviving refreshes. Storage failures are ignored. */
export function createDeliveryStore(storage) {
  const memory = new Set();
  const safe = (fn, fallback) => {
    try {
      return storage ? fn() : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    has(id) {
      return memory.has(id) || safe(() => storage.getItem(STORE_PREFIX + id) === '1', false);
    },
    add(id) {
      memory.add(id);
      safe(() => storage.setItem(STORE_PREFIX + id, '1'));
    },
    /** Drops entries for other breaks of this user, so storage doesn't grow. */
    prune(userId, keepBreakKey) {
      safe(() => {
        for (let i = storage.length - 1; i >= 0; i -= 1) {
          const k = storage.key(i);
          if (k?.startsWith(`${STORE_PREFIX}${userId}|`) && !k.includes(`|${keepBreakKey}|`)) storage.removeItem(k);
        }
      });
    },
  };
}

/**
 * One scheduler per signed-in user. `update(record)` with every new attendance
 * state; `check()` on visibility/focus. Timers are only triggers — elapsed time
 * is re-verified against the current record before anything is shown.
 */
export function createBreakReminderScheduler({
  userId,
  onReminder,
  onBreakInactive = () => {},
  store = createDeliveryStore(null),
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let session = null;
  let timer = null;
  let stopped = false;

  const deliveryId = (type) => `${userId}|${session.key}|${type}`;
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const schedule = () => {
    cancel();
    if (!session || stopped) return;
    const t = now();
    const next = [session.exhaustAtMs - WARNING_BEFORE_MS, session.exhaustAtMs].find((at) => at > t);
    if (next === undefined) return;
    // +250ms so the re-check lands safely past the boundary.
    timer = setTimer(check, next - t + 250);
  };

  function check() {
    timer = null;
    if (!session || stopped) return;
    const t = now();
    const type = dueReminder(session, t);
    if (type && !store.has(deliveryId(type))) {
      store.add(deliveryId(type));
      // Showing TIME_OVER also retires the 5-minute warning for this break.
      if (type === BREAK_REMINDER.TIME_OVER) store.add(deliveryId(BREAK_REMINDER.ENDING_SOON));
      onReminder(type, { startMs: session.startMs, remainingMs: Math.max(0, session.exhaustAtMs - t) });
    }
    schedule();
  }

  return {
    update(record, allowanceMinutes) {
      if (stopped) return;
      const next = getActiveBreakSession(record, allowanceMinutes);
      // Same break, same allowance: nothing to redo (re-renders, refetches).
      if (session && next && session.key === next.key && session.exhaustAtMs === next.exhaustAtMs) return;
      if (session && next && session.key === next.key) {
        session = next; // allowance info changed — reschedule, keep delivery history
        check();
        return;
      }
      cancel();
      const hadSession = Boolean(session);
      session = next;
      if (!session) {
        if (hadSession) onBreakInactive();
        return;
      }
      store.prune(userId, session.key);
      check();
    },
    check,
    stop() {
      stopped = true;
      cancel();
      session = null;
    },
    /** For tests/diagnostics. */
    get pending() {
      return timer !== null;
    },
  };
}

/** Optional short beep via Web Audio. Silently does nothing if blocked or unsupported. */
export function playReminderSound(type, win = globalThis.window) {
  try {
    const Ctx = win?.AudioContext || win?.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    const tones = type === BREAK_REMINDER.TIME_OVER ? [880, 660] : [660];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.25;
      osc.start(t);
      osc.stop(t + 0.18);
    });
    setTimeout(() => ctx.close?.().catch?.(() => {}), 1000);
    ctx.resume?.()?.catch?.(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Brief vibration where supported (not on iOS Safari). */
export function vibrateForReminder(type, nav = globalThis.navigator) {
  try {
    if (typeof nav?.vibrate !== 'function') return false;
    return nav.vibrate(type === BREAK_REMINDER.TIME_OVER ? [300, 150, 300] : [200]);
  } catch {
    return false;
  }
}

/** System notification only if the user already granted permission; never prompts. */
export function showSystemNotification(title, body, win = globalThis.window) {
  try {
    const N = win?.Notification;
    if (!N || N.permission !== 'granted') return false;
    new N(title, { body, tag: 'zorx-break-reminder' });
    return true;
  } catch {
    return false;
  }
}
