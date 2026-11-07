import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTENDANCE_UI_STATE as S, deriveAttendanceUiState, isRetryableLoadError } from './attendanceUiState.js';

const at = '2026-10-31T04:00:00.000Z';

test('the server record decides the action', () => {
  assert.equal(deriveAttendanceUiState({ loaded: true, record: null }), S.NOT_CHECKED_IN);
  assert.equal(deriveAttendanceUiState({ loaded: true, record: { checkIn: { timestamp: at } } }), S.WORKING);
  assert.equal(deriveAttendanceUiState({ loaded: true, record: { checkIn: { timestamp: at }, breaks: [{ startTime: at, endTime: null }] } }), S.ON_BREAK);
  assert.equal(deriveAttendanceUiState({ loaded: true, record: { checkIn: { timestamp: at }, breaks: [{ startTime: at, endTime: at }] } }), S.WORKING);
  assert.equal(deriveAttendanceUiState({ loaded: true, record: { checkIn: { timestamp: at }, checkOut: { timestamp: at } } }), S.COMPLETED);
});

test('never "not checked in" before the server has answered (the Krishna Kumar bug)', () => {
  assert.equal(deriveAttendanceUiState({ loaded: false, record: null }), S.UNAVAILABLE);
});

test('which load failures are retried automatically', () => {
  assert.equal(isRetryableLoadError(new Error('Network Error')), true); // no response
  assert.equal(isRetryableLoadError({ response: { status: 502 } }), true);
  assert.equal(isRetryableLoadError({ response: { status: 503 } }), true);
  assert.equal(isRetryableLoadError({ response: { status: 429 } }), true);
  assert.equal(isRetryableLoadError({ response: { status: 401 } }), false);
  assert.equal(isRetryableLoadError({ response: { status: 403 } }), false);
});

test('isLocationFree: approved WFH today needs no GPS; office days and onsite days do', async () => {
  const { isLocationFree } = await import('./attendanceUiState.js');
  assert.equal(isLocationFree({ wfhToday: { approved: true, defaultWfh: false } }), true); // approved request today (Shijin, 7 Nov)
  assert.equal(isLocationFree({ defaultWfh: true }), true); // permanent WFH
  assert.equal(isLocationFree({ wfhToday: { approved: false } }), false); // pending / rejected / other day
  assert.equal(isLocationFree({ wfhToday: null }), false); // lookup failed → normal GPS flow (server still decides)
  assert.equal(isLocationFree({}), false); // normal office day
  assert.equal(isLocationFree({ onsiteToday: { approved: true }, wfhToday: { approved: true } }), false); // onsite always records GPS
  assert.equal(isLocationFree({ verificationMode: 'WIFI' }), true);
  assert.equal(isLocationFree({ verificationMode: 'WIFI', attendanceLocation: { name: 'Dubai' } }), false); // own site → GPS
});
