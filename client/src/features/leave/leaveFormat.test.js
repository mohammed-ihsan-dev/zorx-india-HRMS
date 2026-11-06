import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveDurationLabel, leaveTitle, formatLeaveDays, isHalfDay } from './leaveFormat.js';

test('labels: half day with session, full day, and older records without a duration', () => {
  assert.equal(leaveTitle({ leaveType: 'CASUAL', duration: 'HALF_DAY', halfDaySession: 'MORNING' }), 'Casual Leave — Half Day (Morning)');
  assert.equal(leaveTitle({ leaveType: 'PAID', duration: 'HALF_DAY', halfDaySession: 'EVENING' }), 'Paid Leave — Half Day (Evening)');
  assert.equal(leaveTitle({ leaveType: 'SICK', duration: 'FULL_DAY' }), 'Sick Leave — Full Day');
  assert.equal(leaveDurationLabel({ leaveType: 'SICK' }), 'Full Day'); // older record
  assert.equal(isHalfDay({}), false);
});

test('day counts', () => {
  assert.equal(formatLeaveDays(0.5), '0.5 day');
  assert.equal(formatLeaveDays(1), '1 day');
  assert.equal(formatLeaveDays(3), '3 days');
});

test('accruedAvailable: Casual and Sick both credit 1/month from creditStart and carry forward', async () => {
  const { accruedAvailable } = await import('./leaveFormat.js');
  const sick = { creditStart: '2026-11-01T00:00:00.000Z', accruesPerMonth: 1, approved: 0, pending: 0 };
  assert.equal(accruedAvailable(sick, '2026-10-20'), 0); // before eligibility
  assert.equal(accruedAvailable(sick, '2026-11-20'), 1);
  assert.equal(accruedAvailable(sick, '2027-02-03'), 4); // Nov–Feb carried forward
  assert.equal(accruedAvailable({ ...sick, approved: 1, pending: 0.5 }, '2027-02-03'), 2.5); // half days count 0.5
  assert.equal(accruedAvailable({ ...sick, approved: 9 }, '2026-12-01'), 0); // never negative
  assert.equal(accruedAvailable(null, '2026-12-01'), null);
});

test('balanceLine for HR review: same numbers as the summary', async () => {
  const { balanceLine } = await import('./leaveFormat.js');
  const sick = { creditStart: '2026-11-01T00:00:00.000Z', accruesPerMonth: 1, credited: 4, approved: 1, pending: 1, available: 2, eligibleNow: true };
  assert.equal(balanceLine('SICK', sick), 'Sick Leave: 2 available · 1 pending · 1 approved · 4 credited since Nov 2026.');
  assert.equal(balanceLine('SICK', { ...sick, eligibleNow: false }), 'Sick Leave: not yet eligible (first month Nov 2026).');
  assert.equal(balanceLine('PAID', { allowance: null, used: 2 }), 'Paid Leave: 2 days used this month (no allowance).');
});
