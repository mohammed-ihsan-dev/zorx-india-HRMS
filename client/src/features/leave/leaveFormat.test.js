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
