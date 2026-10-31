// Which punch action the dashboard offers, from the server's record only.
// A failed load is NEVER treated as "not checked in": that showed Check In to
// people who had already checked in (the server then rightly refused it).

export const ATTENDANCE_UI_STATE = {
  NOT_CHECKED_IN: 'NOT_CHECKED_IN',
  WORKING: 'WORKING',
  ON_BREAK: 'ON_BREAK',
  COMPLETED: 'COMPLETED',
  // Today's status couldn't be loaded and no earlier answer is known: offer Retry, no punch.
  UNAVAILABLE: 'UNAVAILABLE',
};

export const RESYNC_MIN_GAP_MS = 30 * 1000; // re-check on tab return / reconnect, at most this often
export const RETRY_DELAY_MS = 1500; // one automatic retry (e.g. the API waking up)

/**
 * @param {{ loaded: boolean, record: object|null }} s  loaded = the server has answered at least once
 */
export function deriveAttendanceUiState({ loaded, record }) {
  if (!loaded) return ATTENDANCE_UI_STATE.UNAVAILABLE;
  if (!record?.checkIn) return ATTENDANCE_UI_STATE.NOT_CHECKED_IN;
  if (record.checkOut) return ATTENDANCE_UI_STATE.COMPLETED;
  const last = record.breaks?.[record.breaks.length - 1];
  return last && !last.endTime ? ATTENDANCE_UI_STATE.ON_BREAK : ATTENDANCE_UI_STATE.WORKING;
}

/** Worth retrying automatically: no response at all, a timeout, or a server error. Not 401/403/4xx. */
export const isRetryableLoadError = (err) => !err?.response || err.response.status >= 500 || err.response.status === 429;
