import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSecondSaturdayKey, isRecurringWfhDay } from './recurringWfh.js';

test('second Saturdays in October/November 2026 and January 2027', () => {
  assert.equal(isSecondSaturdayKey('2026-10-10'), true);
  assert.equal(isSecondSaturdayKey('2026-11-14'), true);
  assert.equal(isSecondSaturdayKey('2027-01-09'), true);
  for (const k of ['2026-10-03', '2026-10-17', '2026-10-24', '2026-10-31', '2026-10-09', '2026-11-07']) assert.equal(isSecondSaturdayKey(k), false, k);
  assert.equal(isSecondSaturdayKey('garbage'), false);
});

test('only applies for an employee whose rule the server reported', () => {
  assert.equal(isRecurringWfhDay('SECOND_SATURDAY', '2026-10-10'), true);
  assert.equal(isRecurringWfhDay(null, '2026-10-10'), false);
  assert.equal(isRecurringWfhDay('UNKNOWN_RULE', '2026-10-10'), false);
});
