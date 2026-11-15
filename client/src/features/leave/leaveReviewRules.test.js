import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveReviewBlock } from './leaveReviewRules.js';

const hr = { role: 'ADMIN', employee: { _id: 'hr1' } };
const boss = { role: 'SUPER_ADMIN', employee: { _id: 'sa1' } };

test('HR cannot review their own leave', () => assert.match(leaveReviewBlock(hr, { employeeId: { _id: 'hr1' }, requesterRole: 'ADMIN' }), /own request/));
test('HR cannot review another HR/Admin request', () => assert.match(leaveReviewBlock(hr, { employeeId: 'hr2', requesterRole: 'ADMIN' }), /Super Admin/));
test('HR reviews ordinary employee leave as before', () => assert.equal(leaveReviewBlock(hr, { employeeId: 'e1', requesterRole: 'EMPLOYEE' }), null));
test('Super Admin reviews HR leave', () => assert.equal(leaveReviewBlock(boss, { employeeId: 'hr1', requesterRole: 'ADMIN' }), null));
test('Super Admin cannot review their own leave', () => assert.match(leaveReviewBlock(boss, { employeeId: { _id: 'sa1' }, requesterRole: 'SUPER_ADMIN' }), /own request/));
