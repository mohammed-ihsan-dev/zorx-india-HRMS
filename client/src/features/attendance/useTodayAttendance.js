import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGeolocation, LOCATION_STATUS } from '../../hooks/useGeolocation.js';
import { useToast } from '../../hooks/useToast.js';
import * as attendanceService from '../../services/attendanceService.js';
import * as wfhService from '../../services/wfhService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { formatCountdownSeconds } from '../../utils/formatters.js';
import { announceAttendanceRecord } from './BreakReminderWatcher.jsx';
import { breakAllowanceUsage } from './breakReminders.js';
import { netWorkedMinutes, requiredWorkingMinutes, progressPercent as toProgressPercent } from './workingTime.js';

import { ATTENDANCE_UI_STATE, deriveAttendanceUiState, isRetryableLoadError, RESYNC_MIN_GAP_MS, RETRY_DELAY_MS } from './attendanceUiState.js';

export { ATTENDANCE_UI_STATE };

/**
 * Single source of truth for the dashboard's attendance card and working-hours
 * tracker. Fetches the day's attendance + office settings once, keeps a live
 * "worked minutes" tick while checked in, and exposes the real check-in/out
 * actions (unchanged backend calls — this only lifts state out of the widget
 * so multiple dashboard cards can share it without duplicate fetches).
 */
export function useTodayAttendance() {
  const toast = useToast();
  const geolocation = useGeolocation();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [record, setRecordState] = useState(null);
  // Every confirmed record is also shared with the app-wide break reminder watcher.
  const setRecord = useCallback((next) => {
    setRecordState(next);
    announceAttendanceRecord(next);
  }, []);
  const [officeSettings, setOfficeSettings] = useState(null);
  const [lastVerification, setLastVerification] = useState(null);
  const [tick, setTick] = useState(() => Date.now());
  // Permanent-WFH employees punch without any location request. Display/flow
  // hint only — the backend independently decides from the employee record.
  // If this lookup fails, the normal location flow is used.
  const [defaultWfh, setDefaultWfh] = useState(false);
  // The full /work-from-home/my/today answer, shared with the WFH banner (no second request).
  const [wfhToday, setWfhToday] = useState(undefined);
  // This employee's own attendance site { name, radiusMeters }, or null for the main office.
  const [attendanceLocation, setAttendanceLocation] = useState(null);
  // This employee's effective schedule (personal overrides or the office's), from the server.
  const [schedule, setSchedule] = useState(null);

  // True once the server has answered; until then a failure means "unknown", never "not checked in".
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastSyncRef = useRef(0);

  const refresh = useCallback(
    async ({ quiet = false } = {}) => {
      lastSyncRef.current = Date.now();
      const load = () =>
        Promise.all([attendanceService.getMyAttendanceToday(), wfhService.getMyWfhToday().catch(() => null)]);
      try {
        let result;
        try {
          result = await load();
        } catch (err) {
          if (!isRetryableLoadError(err)) throw err;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS)); // e.g. the API waking up
          result = await load();
        }
        const [data, wfhToday] = result;
        setRecord(data.attendance);
        setOfficeSettings(data.officeSettings);
        setAttendanceLocation(data.attendanceLocation || null);
        setSchedule(data.schedule || null);
        setDefaultWfh(Boolean(wfhToday?.defaultWfh));
        setWfhToday(wfhToday);
        setLoaded(true);
        setLoadError(false);
      } catch (err) {
        // Keep whatever the server last said; never fall back to "not checked in".
        setLoadError(true);
        if (!quiet) toast.error(getErrorMessage(err, 'Could not load attendance status.'));
      } finally {
        setLoading(false);
      }
    },
    [toast, setRecord]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-sync from the server when coming back to the tab/app or reconnecting
  // (e.g. opened in the morning, checked out from the same page in the evening).
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSyncRef.current < RESYNC_MIN_GAP_MS) return;
      refresh({ quiet: true });
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    window.addEventListener('pageshow', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
      window.removeEventListener('pageshow', resync);
    };
  }, [refresh]);

  const hasCheckedIn = Boolean(record?.checkIn);
  const hasCheckedOut = Boolean(record?.checkOut);
  const isWorking = hasCheckedIn && !hasCheckedOut;

  const activeBreak = useMemo(() => {
    const breaks = record?.breaks;
    if (!breaks?.length) return null;
    const last = breaks[breaks.length - 1];
    return last && !last.endTime ? last : null;
  }, [record]);

  const uiState = deriveAttendanceUiState({ loaded, record });

  // Live tick while working — ticks every 1s when on break for real-time countdown, or 10s while working
  useEffect(() => {
    if (!isWorking) return undefined;
    const intervalMs = activeBreak ? 1000 : 10000;
    const id = setInterval(() => setTick(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [isWorking, activeBreak]);

  // Net of recorded breaks (an active break pauses the clock) — same rule the
  // backend applies at checkout, so the live value matches the final total.
  const workedMinutes = useMemo(() => netWorkedMinutes(record, tick), [record, tick]);

  // A personal daily target (e.g. 7h) wins over the office-derived one.
  const requiredMinutes = useMemo(() => schedule?.dailyTargetMinutes ?? requiredWorkingMinutes(officeSettings), [schedule, officeSettings]);

  const remainingMinutes = requiredMinutes === null ? null : Math.max(0, requiredMinutes - workedMinutes);
  const overtimeMinutes = requiredMinutes === null ? 0 : Math.max(0, workedMinutes - requiredMinutes);
  const progressPercent = toProgressPercent(workedMinutes, requiredMinutes);

  const maxBreakMinutes = officeSettings?.breakDurationMinutes || 60;
  const maxBreakSeconds = maxBreakMinutes * 60;

  // Same calculation the break reminders use (breakReminders.breakAllowanceUsage).
  const totalBreakSecondsUsed = useMemo(
    () => breakAllowanceUsage(record, tick, maxBreakMinutes).usedMs / 1000,
    [record, tick, maxBreakMinutes]
  );
  const breakRemainingSeconds = Math.max(0, maxBreakSeconds - totalBreakSecondsUsed);
  const breakCountdownStr = formatCountdownSeconds(breakRemainingSeconds);

  const breakMinutesUsed = Math.round(totalBreakSecondsUsed / 60);
  const breakRemainingMinutes = Math.max(0, maxBreakMinutes - breakMinutesUsed);

  // Persistent, real location status derived from the last stored punch — not a fake/ephemeral value.
  // Radius that applies to this employee: their own site's, else the main office's.
  const allowedRadius = attendanceLocation?.radiusMeters ?? officeSettings?.attendanceRadius;
  const locationStatus = useMemo(() => {
    const punch = record?.checkOut || record?.checkIn || null;
    if (!punch || !officeSettings) return null;
    return {
      distance: punch.distanceFromOffice,
      radius: allowedRadius,
      inside: punch.distanceFromOffice <= allowedRadius,
    };
  }, [record, officeSettings, allowedRadius]);

  // Location is only collected in GPS mode for office staff. Display/flow hint
  // only — the backend independently enforces the Admin-selected mode.
  const verificationMode = officeSettings?.attendanceVerificationMode === 'WIFI' ? 'WIFI' : 'GPS';
  // An employee with their own site always sends GPS (the server checks it against that site).
  const locationFree = defaultWfh || (verificationMode === 'WIFI' && !attendanceLocation);

  const punch = useCallback(
    async (kind) => {
      setSubmitting(true);
      setLastVerification(null);
      try {
        const coords = locationFree ? {} : await geolocation.request();
        const result = kind === 'in' ? await attendanceService.checkIn(coords) : await attendanceService.checkOut(coords);
        const thisPunch = kind === 'in' ? result.checkIn : result.checkOut;
        setLastVerification({ distance: thisPunch.distanceFromOffice, radius: allowedRadius });
        setRecord(result);
        toast.success(kind === 'in' ? 'Checked in successfully.' : 'Checked out successfully.');
      } catch (err) {
        if (err?.response) {
          toast.error(getErrorMessage(err));
          // The server refused (e.g. "already checked in"): show what it actually has.
          refresh({ quiet: true });
        } else if (err?.message) {
          toast.error(err.message);
        } else {
          toast.error('Could not access your location. Please check browser permissions.');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [geolocation, toast, locationFree, setRecord, refresh, allowedRadius]
  );

  const [breakSubmitting, setBreakSubmitting] = useState(false);

  const startBreak = useCallback(
    async (type) => {
      setBreakSubmitting(true);
      try {
        const result = await attendanceService.startBreak(type);
        setRecord(result);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not start break.'));
      } finally {
        setBreakSubmitting(false);
      }
    },
    [toast, setRecord]
  );

  const endBreak = useCallback(async () => {
    setBreakSubmitting(true);
    try {
      const result = await attendanceService.endBreak();
      setRecord(result);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not end break.'));
    } finally {
      setBreakSubmitting(false);
    }
  }, [toast, setRecord]);

  const resetVirtualAttendance = useCallback(async () => {
    try {
      await attendanceService.resetVirtualAttendance();
    } catch {
      // ignore
    }
    setRecord(null);
    setLastVerification(null);
  }, [setRecord]);

  return {
    loading,
    submitting,
    record,
    officeSettings,
    uiState,
    hasCheckedIn,
    hasCheckedOut,
    isWorking,
    activeBreak,
    breakSubmitting,
    workedMinutes,
    requiredMinutes,
    remainingMinutes,
    overtimeMinutes,
    progressPercent,
    maxBreakMinutes,
    breakMinutesUsed,
    breakRemainingMinutes,
    breakRemainingSeconds,
    breakCountdownStr,
    locationStatus,
    lastVerification,
    geolocation,
    locationFree,
    defaultWfh,
    verificationMode,
    checkIn: () => punch('in'),
    checkOut: () => punch('out'),
    startBreak,
    endBreak,
    resetVirtualAttendance,
    refresh,
    loaded,
    loadError,
    wfhToday,
    attendanceLocation,
    schedule,
    retry: () => refresh(),
    LOCATION_STATUS,
  };
}
