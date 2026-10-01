import { getTodayDateInputValue } from '../../utils/calendarDate.js';

/**
 * Single source of truth for this temporary event feature. Exactly one date,
 * exactly one place — nothing else in the app should hard-code this string.
 * The feature auto-expires on its own: once the viewer's local business date
 * no longer equals this value, isGandhiJayantiToday() simply returns false
 * forever, with no manual disabling required on/after 2026-10-03.
 */
export const GANDHI_JAYANTI_DATE = '2026-10-02';

export const GANDHI_JAYANTI_IMAGE_SRC = '/assets/gandhi-jayanti-2026.png';
export const GANDHI_JAYANTI_MESSAGE = 'Happy Birthday Gandhiji';

/**
 * Dev/test-only date override, for exercising tomorrow's celebration today
 * without touching the real event date above. Vite only inlines VITE_-
 * prefixed vars into the bundle at build time (never a runtime/user-editable
 * control), and `import.meta.env.MODE !== 'production'` means a standard
 * `vite build` (what Vercel runs for the live site) NEVER reads this value,
 * regardless of what happens to be set in the environment — only `vite dev`,
 * or a deliberately non-production build mode, honors it. Unset (the normal
 * case) falls straight through to the real local business date.
 */
function getEffectiveTestDateOverride() {
  if (import.meta.env.MODE === 'production') return null;
  if (typeof window !== 'undefined' && window.__GANDHI_JAYANTI_TEST_DATE__) {
    return window.__GANDHI_JAYANTI_TEST_DATE__;
  }
  return import.meta.env.VITE_GANDHI_JAYANTI_TEST_DATE || null;
}

/**
 * Uses the same local-business-date convention already relied on elsewhere
 * (e.g. the Admin Attendance default date) — no new timezone system.
 */
export function isGandhiJayantiToday() {
  const effectiveDate = getEffectiveTestDateOverride() || getTodayDateInputValue();
  return effectiveDate === GANDHI_JAYANTI_DATE;
}

const SESSION_FLAG_KEY = `zorx_gandhi_jayanti_shown_${GANDHI_JAYANTI_DATE}`;

/**
 * sessionStorage, not localStorage — cleared when the tab/browser closes, so
 * nothing about this temporary event is permanently remembered. Keying the
 * flag by the exact date also means a tab left open past midnight can never
 * suppress a (would-be) celebration on a later date, since a new date simply
 * uses a different key that was never set.
 */
export function hasCelebratedThisSession() {
  try {
    return sessionStorage.getItem(SESSION_FLAG_KEY) === '1';
  } catch {
    return false; // private browsing / storage blocked — fail open to "not shown yet"
  }
}

export function markCelebratedThisSession() {
  try {
    sessionStorage.setItem(SESSION_FLAG_KEY, '1');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gandhi-jayanti-celebrated'));
    }
  } catch {
    // Storage unavailable — the in-memory ref guard in the widget still prevents a repeat this render lifecycle.
  }
}

export function resetCelebratedThisSession() {
  try {
    sessionStorage.removeItem(SESSION_FLAG_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gandhi-jayanti-reset'));
    }
  } catch {
    // Storage unavailable
  }
}

/**
 * True if today is October 2 AND the user has completed a successful check-in
 * celebration during this session. Automatically turns false on October 3.
 */
export function shouldShowGandhiNavbarIcon() {
  return isGandhiJayantiToday() && hasCelebratedThisSession();
}

/**
 * Triggers the single shared Gandhi Jayanti celebration instance.
 * Called automatically on successful October 2 Check-In, and manually
 * when the user clicks the Gandhi Navbar replay icon.
 */
export function triggerGandhiCelebration() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gandhi-jayanti-play'));
  }
}

