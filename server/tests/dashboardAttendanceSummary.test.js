import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { Leave } from '../src/models/Leave.js';
import { getStartOfDayUTC } from '../src/utils/dateUtils.js';
import { ROLES, ATTENDANCE_STATUS, LEAVE_STATUS, LEAVE_TYPE } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';

async function createUser(role, email, firstName, lastName, status = 'ACTIVE') {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`,
    firstName,
    lastName,
    joiningDate: new Date('2025-01-01'),
    status,
  });
  user.employeeId = employee._id;
  await user.save();
  return { user, employee };
}

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: DEV_PASSWORD });
  return res.body.data.token;
}

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('Admin Dashboard — today\'s attendance summary', () => {
  test('Present/Late/HalfDay/Leave/Absent are counted correctly, matching Admin Attendance semantics', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'dash-admin@zorx.test', 'Admin', 'User');
    const today = getStartOfDayUTC(new Date());

    // Employee 1 — PRESENT
    const { employee: emp1 } = await createUser(ROLES.EMPLOYEE, 'dash-emp1@zorx.test', 'Emp', 'One');
    await Attendance.create({
      employeeId: emp1._id,
      date: today,
      checkIn: { timestamp: new Date(), latitude: 1, longitude: 1, distanceFromOffice: 5 },
      status: ATTENDANCE_STATUS.PRESENT,
    });

    // Employee 2 — LATE
    const { employee: emp2 } = await createUser(ROLES.EMPLOYEE, 'dash-emp2@zorx.test', 'Emp', 'Two');
    await Attendance.create({
      employeeId: emp2._id,
      date: today,
      checkIn: { timestamp: new Date(), latitude: 1, longitude: 1, distanceFromOffice: 5 },
      status: ATTENDANCE_STATUS.LATE,
      lateMinutes: 25,
    });

    // Employee 3 — HALF_DAY
    const { employee: emp3 } = await createUser(ROLES.EMPLOYEE, 'dash-emp3@zorx.test', 'Emp', 'Three');
    await Attendance.create({
      employeeId: emp3._id,
      date: today,
      checkIn: { timestamp: new Date(), latitude: 1, longitude: 1, distanceFromOffice: 5 },
      checkOut: { timestamp: new Date(), latitude: 1, longitude: 1, distanceFromOffice: 5 },
      status: ATTENDANCE_STATUS.HALF_DAY,
      totalWorkingMinutes: 120,
    });

    // Employee 4 — no attendance record, but APPROVED leave covering today
    const { employee: emp4 } = await createUser(ROLES.EMPLOYEE, 'dash-emp4@zorx.test', 'Emp', 'Four');
    await Leave.create({
      employeeId: emp4._id,
      leaveType: LEAVE_TYPE.CASUAL,
      startDate: new Date(today.getTime() - 86400000),
      endDate: new Date(today.getTime() + 86400000),
      days: 3,
      reason: 'Personal',
      status: LEAVE_STATUS.APPROVED,
    });

    // Employee 5 — no attendance, no leave -> must be Absent
    await createUser(ROLES.EMPLOYEE, 'dash-emp5@zorx.test', 'Emp', 'Five');

    // Employee 6 — INACTIVE, no attendance, no leave -> must NOT count as Absent
    await createUser(ROLES.EMPLOYEE, 'dash-emp6-inactive@zorx.test', 'Emp', 'Six', 'INACTIVE');

    // A PENDING (not approved) leave for emp5 must NOT count as Leave Taken.
    await Leave.create({
      employeeId: (await Employee.findOne({ firstName: 'Emp', lastName: 'Five' }))._id,
      leaveType: LEAVE_TYPE.SICK,
      startDate: today,
      endDate: today,
      days: 1,
      reason: 'Pending request',
      status: LEAVE_STATUS.PENDING,
    });

    const token = await login(admin.email);
    const res = await request(app).get('/api/dashboard/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const d = res.body.data;
    // 6 active employees: emp1-5 plus the admin's own linked Employee record
    // (HR/Admin is also an employee — see the existing RBAC attendance rules).
    // emp6 (INACTIVE) is correctly excluded.
    expect(d.totalEmployees).toBe(6);
    expect(d.present).toBe(1); // only emp1
    expect(d.late).toBe(1); // only emp2
    expect(d.halfDay).toBe(1); // only emp3
    expect(d.onLeave).toBe(1); // only emp4 (approved); emp5's PENDING leave doesn't count
    expect(d.absent).toBe(2); // emp5 and the admin — neither has a record or approved leave today
    expect(d.attendanceDate).toBe(today.toISOString().slice(0, 10));

    // Present + Late + HalfDay + Leave + Absent must reconcile with totalEmployees —
    // the whole point of not double-counting mutually exclusive statuses.
    expect(d.present + d.late + d.halfDay + d.onLeave + d.absent).toBe(d.totalEmployees);
  });

  test('the attendance summary is always today, independent of the work-analytics range filter', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'dash-admin2@zorx.test', 'Admin', 'User');
    const today = getStartOfDayUTC(new Date());
    const { employee: emp1 } = await createUser(ROLES.EMPLOYEE, 'dash-emp1b@zorx.test', 'Emp', 'One');
    await Attendance.create({
      employeeId: emp1._id,
      date: today,
      checkIn: { timestamp: new Date(), latitude: 1, longitude: 1, distanceFromOffice: 5 },
      status: ATTENDANCE_STATUS.PRESENT,
    });

    const token = await login(admin.email);

    const allTime = await request(app).get('/api/dashboard/admin').query({ range: 'all' }).set('Authorization', `Bearer ${token}`);
    const todayRange = await request(app).get('/api/dashboard/admin').query({ range: 'today' }).set('Authorization', `Bearer ${token}`);
    const weekRange = await request(app).get('/api/dashboard/admin').query({ range: 'week' }).set('Authorization', `Bearer ${token}`);

    // Attendance numbers must be identical regardless of the work-analytics range.
    expect(allTime.body.data.present).toBe(1);
    expect(todayRange.body.data.present).toBe(1);
    expect(weekRange.body.data.present).toBe(1);
  });
});
