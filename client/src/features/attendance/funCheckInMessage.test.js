import { test } from 'node:test';
import assert from 'node:assert/strict';
import { funCheckInMessage, FUN_CHECK_IN_MESSAGE } from './funCheckInMessage.js';

const rec = (employeeId, date) => ({ employeeId, date, checkIn: { timestamp: '2026-11-09T04:00:00.000Z' } });

test('Aysha Hiba, 9 Nov 2026 → the fun message', () => {
  assert.equal(funCheckInMessage(rec('6ac4a5099df7babccffd6ef4', '2026-11-09T00:00:00.000Z')), FUN_CHECK_IN_MESSAGE);
  assert.equal(funCheckInMessage(rec({ _id: '6ac4a5099df7babccffd6ef4' }, '2026-11-09T00:00:00.000Z')), FUN_CHECK_IN_MESSAGE);
});

test('anyone else, or any other day → nothing', () => {
  assert.equal(funCheckInMessage(rec('6aabba950573c80dc46eb6bc', '2026-11-09T00:00:00.000Z')), null);
  assert.equal(funCheckInMessage(rec('6ac4a5099df7babccffd6ef4', '2026-11-08T00:00:00.000Z')), null);
  assert.equal(funCheckInMessage(rec('6ac4a5099df7babccffd6ef4', '2026-11-10T00:00:00.000Z')), null);
  assert.equal(funCheckInMessage(null), null);
  assert.equal(funCheckInMessage({ employeeId: '6ac4a5099df7babccffd6ef4', date: '2026-11-09T00:00:00.000Z' }), null); // no check-in
});
