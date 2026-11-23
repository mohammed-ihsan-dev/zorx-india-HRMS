import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeaveReportParams, formatDayCount, leaveDurationText, sickRemainingCard, periodRangeText } from './leaveReportFormat.js';

test('params: current month by default, custom only when complete and in order', () => {
  assert.deepEqual(buildLeaveReportParams({ period: 'current_month' }), { period: 'current_month' });
  assert.deepEqual(buildLeaveReportParams({ period: 'all', employeeId: 'e1', leaveType: 'SICK' }), { period: 'all', employeeId: 'e1', leaveType: 'SICK' });
  assert.equal(buildLeaveReportParams({ period: 'custom', from: '2026-11-01', to: '' }), null);
  assert.equal(buildLeaveReportParams({ period: 'custom', from: '2026-11-10', to: '2026-11-01' }), null);
  assert.deepEqual(buildLeaveReportParams({ period: 'custom', from: '2026-11-01', to: '2026-11-30' }), { period: 'custom', from: '2026-11-01', to: '2026-11-30' });
});

test('day counts: half day 0.5, singular and plural', () => {
  assert.equal(formatDayCount(0.5), '0.5 Day');
  assert.equal(formatDayCount(1), '1 Day');
  assert.equal(formatDayCount(3), '3 Days');
  assert.equal(formatDayCount(0.1 + 0.2), '0.3 Day');
});

test('duration: half-day session and the part inside the period', () => {
  assert.equal(leaveDurationText({ days: 0.5, daysInPeriod: 0.5, duration: 'HALF_DAY', halfDaySession: 'MORNING' }), '0.5 Day (Morning)');
  assert.equal(leaveDurationText({ days: 1, daysInPeriod: 1 }), '1 Day');
  assert.equal(leaveDurationText({ days: 6, daysInPeriod: 3 }), '6 Days · 3 in period');
});

test('sick remaining card never invents a balance', () => {
  assert.equal(sickRemainingCard(null, false).value, '—');
  // Yearly Sick Leave: remaining of this leave year's entitlement, available now, reset day.
  assert.deepEqual(
    sickRemainingCard({ state: 'ok', allowance: 12, remaining: 8.5, credited: 5, availableToRequest: 1.5, approved: 3.5, pending: 0, accruesPerMonth: 1, resetsOn: '2027-09-01T00:00:00Z' }, true),
    { value: '8.5 / 12', hint: '1.5 available now (5 credited) · resets 01 Sep 2027' }
  );
  assert.match(sickRemainingCard({ state: 'ok', remaining: 1, credited: 2, pending: 0.5, accruesPerMonth: 1 }, true).hint, /0\.5 pending/);
  assert.equal(sickRemainingCard({ state: 'not_eligible', eligibleFrom: '2027-01-01T00:00:00Z' }, true).hint, 'Eligible from Jan 2027');
  assert.equal(sickRemainingCard({ state: 'unavailable', reason: 'No joining date on the employee profile.' }, true).value, 'Unavailable');
});

test('period text', () => {
  assert.equal(periodRangeText({ from: '2026-11-01', to: '2026-11-30' }), '01 Nov 2026 – 30 Nov 2026');
  assert.equal(periodRangeText({ from: null, to: null }), 'All time');
});
