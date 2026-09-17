import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import * as leaveService from '../src/services/leaveService.js';
import { LEAVE_TYPE } from '../src/utils/constants.js';

let employeeId;
const year = new Date().getFullYear();

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  employeeId = new mongoose.Types.ObjectId();
});

describe('leaveService', () => {
  test('calculateLeaveDays is inclusive of both start and end date', () => {
    expect(leaveService.calculateLeaveDays('2026-02-10', '2026-02-12')).toBe(3);
    expect(leaveService.calculateLeaveDays('2026-02-10', '2026-02-10')).toBe(1);
  });

  test('rejects an end date before the start date', () => {
    expect(() => leaveService.calculateLeaveDays('2026-02-12', '2026-02-10')).toThrow();
  });

  test('deducts from leave balance and prevents overdraw for sick/earned leave, allows casual leave at own risk', async () => {
    const balance = await leaveService.getOrCreateLeaveBalance(employeeId, year);
    expect(balance.balances[LEAVE_TYPE.CASUAL]).toBe(0);
    expect(balance.balances[LEAVE_TYPE.SICK]).toBe(1);
    expect(balance.balances[LEAVE_TYPE.EARNED]).toBe(1);

    // Casual leave can be deducted even with 0 company balance (user's own risk)
    await leaveService.deductLeaveBalance(employeeId, LEAVE_TYPE.CASUAL, 5, year);
    const updated = await leaveService.getOrCreateLeaveBalance(employeeId, year);
    expect(updated.used[LEAVE_TYPE.CASUAL]).toBe(5);

    // Sick leave has 1 day available, deducting 2 should fail
    await expect(leaveService.deductLeaveBalance(employeeId, LEAVE_TYPE.SICK, 2, year)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('restoring leave balance after cancellation', async () => {
    await leaveService.deductLeaveBalance(employeeId, LEAVE_TYPE.SICK, 1, year);
    await leaveService.restoreLeaveBalance(employeeId, LEAVE_TYPE.SICK, 1, year);
    const balance = await leaveService.getOrCreateLeaveBalance(employeeId, year);
    expect(balance.used[LEAVE_TYPE.SICK]).toBe(0);
  });

  test('unpaid leave does not draw from balance', async () => {
    await leaveService.deductLeaveBalance(employeeId, LEAVE_TYPE.UNPAID, 100, year);
    const balance = await leaveService.getOrCreateLeaveBalance(employeeId, year);
    expect(balance.used[LEAVE_TYPE.CASUAL]).toBe(0);
  });

  test('assertNoOverlap allows a range with no existing leave', async () => {
    await expect(
      leaveService.assertNoOverlap(employeeId, new Date('2026-09-18'), new Date('2026-09-20'))
    ).resolves.toBeUndefined();
  });

  test('assertNoOverlap rejects a range overlapping a pending/approved leave', async () => {
    const { Leave } = await import('../src/models/Leave.js');
    await Leave.create({
      employeeId,
      leaveType: LEAVE_TYPE.CASUAL,
      startDate: new Date('2026-09-18'),
      endDate: new Date('2026-09-20'),
      days: 3,
      reason: 'Existing leave',
      status: 'APPROVED',
    });

    await expect(
      leaveService.assertNoOverlap(employeeId, new Date('2026-09-19'), new Date('2026-09-21'))
    ).rejects.toMatchObject({ statusCode: 400 });

    // A non-overlapping range right after the existing leave is still fine.
    await expect(
      leaveService.assertNoOverlap(employeeId, new Date('2026-09-21'), new Date('2026-09-22'))
    ).resolves.toBeUndefined();
  });

  test('assertNoOverlap ignores rejected/cancelled leave', async () => {
    const { Leave } = await import('../src/models/Leave.js');
    await Leave.create({
      employeeId,
      leaveType: LEAVE_TYPE.CASUAL,
      startDate: new Date('2026-09-18'),
      endDate: new Date('2026-09-20'),
      days: 3,
      reason: 'Rejected leave',
      status: 'REJECTED',
    });

    await expect(
      leaveService.assertNoOverlap(employeeId, new Date('2026-09-19'), new Date('2026-09-19'))
    ).resolves.toBeUndefined();
  });
});
