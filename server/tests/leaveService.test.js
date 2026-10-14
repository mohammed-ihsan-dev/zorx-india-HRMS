import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import * as leaveService from '../src/services/leaveService.js';
import { LEAVE_TYPE } from '../src/utils/constants.js';

let employeeId;

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

  describe('leave policy', () => {
    const employee = () => ({ _id: employeeId, joiningDate: new Date('2026-01-15') });
    const addLeave = async (leaveType, start, status = 'APPROVED', days = 1) => {
      const { Leave } = await import('../src/models/Leave.js');
      return Leave.create({ employeeId, leaveType, startDate: new Date(start), endDate: new Date(start), days, reason: 'Existing', status });
    };

    test('Sick Leave is eligible from exactly 3 months after joining', () => {
      expect(leaveService.getSickLeaveEligibleFrom(new Date('2026-09-01')).toISOString().slice(0, 10)).toBe('2026-12-01');
      expect(leaveService.getSickLeaveEligibleFrom(null)).toBeNull();
    });

    test('Sick Leave before the eligibility date is rejected; on/after it is allowed', async () => {
      const newJoiner = { _id: employeeId, joiningDate: new Date('2026-09-01') };
      await expect(leaveService.assertLeaveAllowed(newJoiner, LEAVE_TYPE.SICK, new Date('2026-11-30'), 1)).rejects.toMatchObject({ statusCode: 400 });
      await expect(leaveService.assertLeaveAllowed(newJoiner, LEAVE_TYPE.SICK, new Date('2026-12-01'), 1)).resolves.toBeUndefined();
    });

    test('Sick Leave is limited to 1 day per calendar month (no carry-forward)', async () => {
      const type = LEAVE_TYPE.SICK;
      await expect(leaveService.assertLeaveAllowed(employee(), type, new Date('2026-10-05'), 2)).rejects.toMatchObject({ statusCode: 400 });
      await addLeave(type, '2026-10-05');
      await expect(leaveService.assertLeaveAllowed(employee(), type, new Date('2026-10-20'), 1)).rejects.toMatchObject({ statusCode: 400 });
      await expect(leaveService.assertLeaveAllowed(employee(), type, new Date('2026-11-02'), 1)).resolves.toBeUndefined();
      await expect(leaveService.assertLeaveAllowed(employee(), type, new Date('2026-12-02'), 2)).rejects.toMatchObject({ statusCode: 400 });
    });

    describe('Casual Leave accrual and carry-forward', () => {
      const credits = leaveService.casualCreditsThrough;

      test('1 day per calendar month from Oct 2026, counted inclusively, with no back-dated credits', () => {
        const veteran = new Date('2024-01-15');
        expect(credits(veteran, new Date('2026-09-30'))).toBe(0);
        expect(credits(veteran, new Date('2026-10-01'))).toBe(1);
        expect(credits(veteran, new Date('2026-10-31T23:59:59Z'))).toBe(1);
        expect(credits(veteran, new Date('2026-11-01'))).toBe(2);
        expect(credits(veteran, new Date('2026-12-31'))).toBe(3);
        expect(credits(veteran, new Date('2027-01-01'))).toBe(4); // across year-end
        expect(credits(veteran, new Date('2028-10-15'))).toBe(25); // no cap
      });

      test('a later joiner earns from the joining month (joining month included)', () => {
        expect(credits(new Date('2026-12-28'), new Date('2026-12-31'))).toBe(1);
        expect(credits(new Date('2026-12-28'), new Date('2026-11-30'))).toBe(0);
        expect(credits(new Date('2026-12-28'), new Date('2027-02-01'))).toBe(3);
        expect(leaveService.getCasualCreditStart(new Date('2026-12-28')).toISOString().slice(0, 10)).toBe('2026-12-01');
        expect(leaveService.getCasualCreditStart(new Date('2024-01-15')).toISOString().slice(0, 10)).toBe('2026-10-01');
        expect(leaveService.getCasualCreditStart(null).toISOString().slice(0, 10)).toBe('2026-10-01');
      });

      test('unused days accumulate and can be spent together later', async () => {
        // Oct, Nov, Dec unused → 3 days available for a 3-day leave in December.
        await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.CASUAL, new Date('2026-12-10'), 3)).resolves.toBeUndefined();
        await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.CASUAL, new Date('2026-12-10'), 4)).rejects.toMatchObject({
          statusCode: 400,
          details: { available: 3, requested: 4, shortfall: 1 },
        });
      });

      test('consumed days reduce the balance; the next month adds one back', async () => {
        await addLeave(LEAVE_TYPE.CASUAL, '2026-10-05');
        expect(await leaveService.getCasualAvailable(employee(), new Date('2026-10-20'))).toBe(0);
        expect(await leaveService.getCasualAvailable(employee(), new Date('2026-11-03'))).toBe(1);
        expect(await leaveService.getCasualAvailable(employee(), new Date('2027-01-03'))).toBe(3);
      });

      test('days already booked in a later month still count, so no combination can overspend', async () => {
        await addLeave(LEAVE_TYPE.CASUAL, '2026-12-10', 'APPROVED', 3); // uses Oct+Nov+Dec credits
        await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.CASUAL, new Date('2026-10-20'), 1)).rejects.toMatchObject({ statusCode: 400 });
        await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.CASUAL, new Date('2027-01-05'), 1)).resolves.toBeUndefined();
      });

      test('casual leave dated before accrual began (old "user\'s risk" leave) is not charged against the new balance', async () => {
        await addLeave(LEAVE_TYPE.CASUAL, '2026-09-10', 'APPROVED', 2);
        expect(await leaveService.getCasualAvailable(employee(), new Date('2026-10-20'))).toBe(1);
      });

      test('approval only counts already-approved days, so any one of several pending requests can be approved', async () => {
        const a = await addLeave(LEAVE_TYPE.CASUAL, '2026-10-05', 'PENDING');
        await addLeave(LEAVE_TYPE.CASUAL, '2026-10-06', 'PENDING');
        await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.CASUAL, a.startDate, 1, a._id, { approving: true })).resolves.toBeUndefined();
      });

      test('Paid Leave is unaffected by the casual balance', async () => {
        await addLeave(LEAVE_TYPE.CASUAL, '2026-10-05');
        await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.PAID, new Date('2026-10-20'), 4)).resolves.toBeUndefined();
        expect(await leaveService.getCasualAvailable(employee(), new Date('2026-10-20'))).toBe(0);
      });
    });

    test('pending requests count toward the monthly limit; rejected and cancelled ones do not', async () => {
      await addLeave(LEAVE_TYPE.CASUAL, '2026-10-05', 'REJECTED');
      await addLeave(LEAVE_TYPE.CASUAL, '2026-10-06', 'CANCELLED');
      await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.CASUAL, new Date('2026-10-20'), 1)).resolves.toBeUndefined();
      await addLeave(LEAVE_TYPE.CASUAL, '2026-10-07', 'PENDING');
      await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.CASUAL, new Date('2026-10-20'), 1)).rejects.toMatchObject({ statusCode: 400 });
    });

    test('approving the request itself is not blocked by its own days (excludeLeaveId)', async () => {
      const own = await addLeave(LEAVE_TYPE.CASUAL, '2026-10-05', 'PENDING');
      await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.CASUAL, own.startDate, 1, own._id)).resolves.toBeUndefined();
    });

    test('Paid Leave has no monthly limit', async () => {
      await addLeave(LEAVE_TYPE.PAID, '2026-10-05', 'APPROVED', 5);
      await expect(leaveService.assertLeaveAllowed(employee(), LEAVE_TYPE.PAID, new Date('2026-10-20'), 3)).resolves.toBeUndefined();
    });

    test('the summary reports the casual balance, this month\'s sick/paid usage and Sick Leave eligibility', async () => {
      await addLeave(LEAVE_TYPE.CASUAL, '2026-10-05');
      await addLeave(LEAVE_TYPE.CASUAL, '2026-11-20', 'PENDING');
      await addLeave(LEAVE_TYPE.PAID, '2026-10-08', 'PENDING', 2);
      await addLeave(LEAVE_TYPE.CASUAL, '2026-09-05');
      const summary = await leaveService.getLeaveSummary({ _id: employeeId, joiningDate: new Date('2026-09-01') }, new Date('2026-12-14'));
      expect(summary.types.CASUAL).toMatchObject({ accruesPerMonth: 1, credited: 3, approved: 1, pending: 1, available: 1 });
      expect(summary.types.CASUAL.creditStart.toISOString().slice(0, 10)).toBe('2026-10-01');
    });

    test('the summary for October 2026 shows this month\'s paid usage and sick eligibility', async () => {
      await addLeave(LEAVE_TYPE.PAID, '2026-10-08', 'PENDING', 2);
      const summary = await leaveService.getLeaveSummary({ _id: employeeId, joiningDate: new Date('2026-09-01') }, new Date('2026-10-14'));
      expect(summary.types.CASUAL).toMatchObject({ credited: 1, available: 1 });
      expect(summary.types.PAID).toEqual({ allowance: null, used: 2 });
      expect(summary.types.SICK).toMatchObject({ allowance: 1, used: 0, eligibleNow: false });
      expect(summary.types.SICK.eligibleFrom.toISOString().slice(0, 10)).toBe('2026-12-01');
    });
  });
});
