import { useEffect, useState } from 'react';

/**
 * The ONE activation rule for every Diwali feature (diya, rangoli, banner,
 * sparkles, mini-game). Inclusive India-time dates; from 11 Nov 2026 it is
 * false forever, so the normal dashboard returns with no deployment.
 */
export const DIWALI_START = '2026-11-06';
export const DIWALI_END = '2026-11-10';
export const DIWALI_TIME_ZONE = 'Asia/Kolkata';

/** "YYYY-MM-DD" of an instant in India time (independent of the viewer's own timezone). */
export function indiaDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DIWALI_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Dev/test-only preview date (same convention as the Gandhi Jayanti feature):
// never read by a production build.
function testDateOverride() {
  if (import.meta.env?.MODE === 'production') return null;
  if (typeof window !== 'undefined' && window.__DIWALI_TEST_DATE__) return window.__DIWALI_TEST_DATE__;
  return import.meta.env?.VITE_DIWALI_TEST_DATE || null;
}

export function isDiwaliActive(now = new Date()) {
  const key = testDateOverride() || indiaDateKey(now);
  return key >= DIWALI_START && key <= DIWALI_END;
}

/** Milliseconds until the next midnight in India time (when the answer can change). */
export function msUntilNextIndiaMidnight(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: DIWALI_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)])
  );
  const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + now.getMilliseconds();
  return Math.max(1000, 86400000 - elapsed);
}

/** Re-checks once at India midnight, so an open tab switches on/off by itself. */
export function useDiwaliActive() {
  const [active, setActive] = useState(() => isDiwaliActive());
  useEffect(() => {
    let id;
    const schedule = () => {
      id = setTimeout(() => {
        setActive(isDiwaliActive());
        schedule();
      }, msUntilNextIndiaMidnight() + 500);
    };
    schedule();
    return () => clearTimeout(id);
  }, []);
  return active;
}
