import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION_NUMBER, APP_BUILD } from '../utils/constants.js';
import {
  CHECK_EVERY_MS,
  RECHECK_ON_VISIBLE_MS,
  SNOOZE_MS,
  parseManifest,
  isNewBuild,
  unsafeReason,
  shouldAutoApply,
  singleFlight,
} from './updatePolicy.js';
import { installUpdateGuards, getUpdateSafety, clearUnsavedInput } from './updateGuard.js';

const UpdateContext = createContext(null);
const ATTEMPT_KEY = 'zorx:update:lastAttempt';

const readAttempt = () => {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null');
  } catch {
    return null;
  }
};
const writeAttempt = (build) => {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ build, at: Date.now() }));
  } catch {
    // storage unavailable (private mode): the in-memory guard below still applies
  }
};

/** The deployed build, bypassing every cache (browser, CDN, service worker). */
async function fetchLatestManifest() {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`version check failed (${res.status})`);
  const manifest = parseManifest(await res.json());
  if (!manifest) throw new Error('version check returned an unexpected response');
  return manifest;
}

/**
 * One update system for the whole app, built on vite-plugin-pwa's service
 * worker (registerType "prompt": nothing activates without our say-so).
 * - Detects: polls /version.json (no-store) and asks the service worker to
 *   fetch a newer sw.js when the build changed.
 * - Applies: only when nothing would be lost (no save in flight, no open
 *   dialog, no unsubmitted typing, idle for a few seconds) and at most once
 *   per build per few minutes; otherwise the Refresh/Later toast stays up.
 */
export function AppUpdateProvider({ children }) {
  const { pathname } = useLocation();
  const registrationRef = useRef(null);
  const lastCheckRef = useRef(0);
  const attemptRef = useRef(readAttempt());

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration || null;
    },
    onRegisterError(error) {
      // Non-fatal — the site keeps working as a normal website without a service worker.
      console.error('Service worker registration failed:', error);
    },
  });

  const [latest, setLatest] = useState(null);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [blockedBy, setBlockedBy] = useState(null); // unsafeReason while an update waits

  const pending = needRefresh || isNewBuild(APP_BUILD, latest);
  // Ready = the new build can actually be loaded now: a waiting service worker,
  // or no service worker at all (a plain reload then fetches it). While a
  // controlled page's worker is still downloading, we wait for needRefresh.
  const hasController = typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);
  const ready = needRefresh || (pending && !hasController);
  const targetBuild = latest?.build || 'service-worker';

  useEffect(() => installUpdateGuards(document), []);
  // Typed input belongs to the page it was typed on.
  useEffect(() => clearUnsavedInput(), [pathname]);

  /** Fetches the deployed version; triggers the service worker to download a new build. */
  const check = useMemo(
    () =>
      singleFlight(async () => {
        lastCheckRef.current = Date.now();
        const manifest = await fetchLatestManifest();
        setLatest(manifest);
        if (isNewBuild(APP_BUILD, manifest)) await registrationRef.current?.update().catch(() => {});
        return manifest;
      }),
    []
  );

  /** Reloads into the new version once it's ready (recorded, to never loop). */
  const apply = useCallback(() => {
    if (!ready) return false;
    attemptRef.current = { build: targetBuild, at: Date.now() };
    writeAttempt(targetBuild);
    if (needRefresh) updateServiceWorker(true); // activate the waiting worker, then reload once
    else window.location.reload(); // no service worker: a reload fetches the new build
    return true;
  }, [ready, needRefresh, targetBuild, updateServiceWorker]);

  // Background checks: every 30 min while visible, on return to the tab, when back online.
  useEffect(() => {
    if (import.meta.env.DEV) return undefined;
    const run = () => check().catch(() => {});
    const maybeRun = () => document.visibilityState === 'visible' && Date.now() - lastCheckRef.current > RECHECK_ON_VISIBLE_MS && run();
    const timer = setInterval(() => document.visibilityState === 'visible' && run(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', maybeRun);
    window.addEventListener('online', run);
    run();
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', maybeRun);
      window.removeEventListener('online', run);
    };
  }, [check]);

  // While an update is pending, apply it as soon as it's safe.
  useEffect(() => {
    if (!pending) {
      setBlockedBy(null);
      return undefined;
    }
    const tick = () => {
      const reason = document.visibilityState === 'hidden' ? unsafeReason({ ...getUpdateSafety(), msSinceInteraction: Infinity }) : unsafeReason(getUpdateSafety());
      setBlockedBy(reason);
      if (shouldAutoApply({ pending: ready, unsafe: Boolean(reason), snoozedUntil, lastAttempt: attemptRef.current, targetBuild, now: Date.now() })) apply();
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [pending, ready, snoozedUntil, targetBuild, apply]);

  const value = useMemo(
    () => ({
      current: { version: APP_VERSION_NUMBER, build: APP_BUILD },
      latest,
      pending,
      ready,
      blockedBy,
      check,
      /** Manual "Refresh": warns first if something typed would be lost. */
      refreshNow: () => {
        const { unsavedInput, dialogOpen } = getUpdateSafety();
        if ((unsavedInput || dialogOpen) && !window.confirm('You have unsaved changes. Update now and discard them?')) return;
        attemptRef.current = null;
        apply();
      },
      later: () => setSnoozedUntil(Date.now() + SNOOZE_MS),
      snoozed: snoozedUntil > Date.now(),
    }),
    [latest, pending, ready, blockedBy, check, apply, snoozedUntil]
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useAppUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useAppUpdate must be used inside AppUpdateProvider');
  return ctx;
}
