import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveDurationLabel, leaveTitle, formatLeaveDays, isHalfDay, leaveTypeName, leaveTypeShort } from './leaveFormat.js';

test('labels: half day with session, full day, and older records without a duration', () => {
  assert.equal(leaveTitle({ leaveType: 'CASUAL', duration: 'HALF_DAY', halfDaySession: 'MORNING' }), 'Casual Leave — Half Day (Morning)');
  assert.equal(leaveTitle({ leaveType: 'LOP', duration: 'HALF_DAY', halfDaySession: 'EVENING' }), 'LoP — Half Day (Evening)');
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

test('accruedAvailable: Sick Leave counts within its leave year (reset in the joining month, max 12)', async () => {
  const { accruedAvailable, renewalText, renewalNote } = await import('./leaveFormat.js');
  // Joined Sep 2026: leave year Sep 2026 – Aug 2027, first credit Nov 2026.
  const sick = { creditStart: '2026-11-01T00:00:00.000Z', accruesPerMonth: 1, approved: 1, pending: 0, leaveYearStart: '2026-09-01T00:00:00.000Z', resetsOn: '2027-09-01T00:00:00.000Z', maxPerYear: 12 };
  assert.equal(accruedAvailable(sick, '2027-02-03'), 3); // Nov–Feb = 4, minus 1 approved
  assert.equal(accruedAvailable(sick, '2027-08-30'), 9); // Nov–Aug = 10
  assert.equal(accruedAvailable(sick, '2027-09-02'), null); // next leave year: the server decides
  const later = { ...sick, creditStart: '2026-11-01T00:00:00.000Z', leaveYearStart: '2027-09-01T00:00:00.000Z', resetsOn: '2028-09-01T00:00:00.000Z', approved: 0 };
  assert.equal(accruedAvailable(later, '2028-08-15'), 12); // a full year never exceeds 12
  assert.equal(renewalText(sick), 'Up to 12 a year · resets 1 Sep 2027.');
  assert.equal(renewalNote({ creditStart: 'x' }), 'unused days carry forward');
});

test('balanceLine for HR review: same numbers as the summary', async () => {
  const { balanceLine } = await import('./leaveFormat.js');
  const sick = { creditStart: '2026-11-01T00:00:00.000Z', accruesPerMonth: 1, credited: 4, approved: 1, pending: 1, available: 2, eligibleNow: true };
  assert.equal(balanceLine('SICK', sick), 'Sick Leave: 2 available · 1 pending · 1 approved · 4 credited since Nov 2026.');
  assert.equal(balanceLine('SICK', { ...sick, eligibleNow: false }), 'Sick Leave: not yet eligible (first month Nov 2026).');
  assert.equal(balanceLine('LOP', { allowance: null, used: 2 }), 'LoP: 2 days used this month (no allowance).');
  assert.equal(
    balanceLine('SICK', { ...sick, credited: 3, yearlyAllowance: 10, resetsOn: '2027-09-01T00:00:00.000Z', maxPerYear: 12 }),
    'Sick Leave: 2 available · 1 pending · 1 approved · 3 of 10 credited this leave year (resets 1 Sep 2027).'
  );
});

test('LoP naming (old PAID records read as LoP)', () => {
  assert.equal(leaveTypeName('LOP'), 'LoP');
  assert.equal(leaveTypeName('PAID'), 'LoP');
  assert.equal(leaveTypeName('CASUAL'), 'Casual Leave');
  assert.equal(leaveTypeShort('SICK'), 'Sick');
  assert.equal(leaveTypeShort('LOP'), 'LoP');
});
