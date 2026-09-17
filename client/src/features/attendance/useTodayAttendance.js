import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGeolocation, LOCATION_STATUS } from '../../hooks/useGeolocation.js';
import { useToast } from '../../hooks/useToast.js';
import * as attendanceService from '../../services/attendanceService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { parseTimeToMinutes } from '../../utils/formatters.js';

export const ATTENDANCE_UI_STATE = {
  NOT_CHECKED_IN: 'NOT_CHECKED_IN',
  WORKING: 'WORKING',
  ON_BREAK: 'ON_BREAK',
  COMPLETED: 'COMPLETED',
};

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
  const [record, setRecord] = useState(null);
  const [officeSettings, setOfficeSettings] = useState(null);
  const [lastVerification, setLastVerification] = useState(null);
  const [tick, setTick] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const data = await attendanceService.getMyAttendanceToday();
      setRecord(data.attendance);
      setOfficeSettings(data.officeSettings);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load attendance status.'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
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

  const uiState = !hasCheckedIn
    ? ATTENDANCE_UI_STATE.NOT_CHECKED_IN
    : hasCheckedOut
    ? ATTENDANCE_UI_STATE.COMPLETED
    : activeBreak
    ? ATTENDANCE_UI_STATE.ON_BREAK
    : ATTENDANCE_UI_STATE.WORKING;

  // Live tick while working — recalculates worked minutes every 30s without a refetch.
  useEffect(() => {
    if (!isWorking) return undefined;
    const id = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, [isWorking]);

  const workedMinutes = useMemo(() => {
    if (hasCheckedOut) return record.totalWorkingMinutes;
    if (hasCheckedIn) return Math.max(0, (tick - new Date(record.checkIn.timestamp).getTime()) / 60000);
    return 0;
  }, [hasCheckedIn, hasCheckedOut, record, tick]);

  const requiredMinutes = useMemo(() => {
    if (!officeSettings) return null;
    const raw =
      parseTimeToMinutes(officeSettings.workingEndTime) -
      parseTimeToMinutes(officeSettings.workingStartTime) -
      officeSettings.breakDurationMinutes;
    return Math.max(0, raw);
  }, [officeSettings]);

  const remainingMinutes = requiredMinutes === null ? null : Math.max(0, requiredMinutes - workedMinutes);
  const overtimeMinutes = requiredMinutes === null ? 0 : Math.max(0, workedMinutes - requiredMinutes);
  const progressPercent = requiredMinutes ? Math.min(100, (workedMinutes / requiredMinutes) * 100) : 0;

  const maxBreakMinutes = officeSettings?.breakDurationMinutes || 60;

  const breakMinutesUsed = useMemo(() => {
    let base = record?.breakMinutes || 0;
    if (activeBreak?.startTime) {
      const activeMs = tick - new Date(activeBreak.startTime).getTime();
      base += Math.max(0, activeMs / 60000);
    }
    return Math.round(base);
  }, [record, activeBreak, tick]);

  const breakRemainingMinutes = Math.max(0, maxBreakMinutes - breakMinutesUsed);

  // Persistent, real location status derived from the last stored punch — not a fake/ephemeral value.
  const locationStatus = useMemo(() => {
    const punch = record?.checkOut || record?.checkIn || null;
    if (!punch || !officeSettings) return null;
    return {
      distance: punch.distanceFromOffice,
      radius: officeSettings.attendanceRadius,
      inside: punch.distanceFromOffice <= officeSettings.attendanceRadius,
    };
  }, [record, officeSettings]);

  const punch = useCallback(
    async (kind) => {
      setSubmitting(true);
      setLastVerification(null);
      try {
        const coords = await geolocation.request();
        const result = kind === 'in' ? await attendanceService.checkIn(coords) : await attendanceService.checkOut(coords);
        const thisPunch = kind === 'in' ? result.checkIn : result.checkOut;
        setLastVerification({ distance: thisPunch.distanceFromOffice, radius: officeSettings?.attendanceRadius });
        setRecord(result);
        toast.success(kind === 'in' ? 'Checked in successfully.' : 'Checked out successfully.');
      } catch (err) {
        if (err?.response) {
          toast.error(getErrorMessage(err));
        } else if (err?.code === undefined) {
          toast.error('Something went wrong. Please try again.');
        }
        // Geolocation-specific errors are already reflected via geolocation.status/errorMessage.
      } finally {
        setSubmitting(false);
      }
    },
    [geolocation, officeSettings, toast]
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
    [toast]
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
  }, [toast]);

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
    locationStatus,
    lastVerification,
    geolocation,
    checkIn: () => punch('in'),
    checkOut: () => punch('out'),
    startBreak,
    endBreak,
    refresh,
    LOCATION_STATUS,
  };
}
