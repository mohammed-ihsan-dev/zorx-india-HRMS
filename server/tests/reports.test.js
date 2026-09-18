import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { Leave } from '../src/models/Leave.js';
import { getStartOfDayUTC } from '../src/utils/dateUtils.js';
import { ROLES, LEAVE_TYPE, LEAVE_STATUS, ATTENDANCE_STATUS } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';

async function createUser(role, email) {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${role}-${Math.random().toString(36).slice(2, 7)}`,
    firstName: role,
    lastName: 'Test',
    joiningDate: new Date('2025-01-01'),
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

describe('attendance report date filtering', () => {
  test('inclusive range 17-18 Sep includes both days and excludes 16/19 Sep', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'admin-att@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-att@zorx.test');
    const token = await login(admin.email);

    const days = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'];
    for (const day of days) {
      await Attendance.create({
        employeeId: employee._id,
        date: getStartOfDayUTC(new Date(`${day}T12:00:00Z`)),
        checkIn: { timestamp: new Date(`${day}T04:00:00Z`), latitude: 1, longitude: 1, distanceFromOffice: 10 },
        status: ATTENDANCE_STATUS.PRESENT,
      });
    }

    const res = await request(app)
      .get('/api/reports/attendance')
      .query({ from: '2026-09-17', to: '2026-09-18' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const returnedDates = res.body.data.map((r) => r.date.slice(0, 10)).sort();
    expect(returnedDates).toEqual(['2026-09-17', '2026-09-18']);
  });

  test('CSV export returns a real CSV file scoped to the selected range', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'admin-csv@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-csv@zorx.test');
    const token = await login(admin.email);

    await Attendance.create({
      employeeId: employee._id,
      date: getStartOfDayUTC(new Date('2026-09-17T12:00:00Z')),
      checkIn: { timestamp: new Date('2026-09-17T04:00:00Z'), latitude: 1, longitude: 1, distanceFromOffice: 10 },
      status: ATTENDANCE_STATUS.PRESENT,
    });
    await Attendance.create({
      employeeId: employee._id,
      date: getStartOfDayUTC(new Date('2026-09-20T12:00:00Z')),
      checkIn: { timestamp: new Date('2026-09-20T04:00:00Z'), latitude: 1, longitude: 1, distanceFromOffice: 10 },
      status: ATTENDANCE_STATUS.PRESENT,
    });

    const res = await request(app)
      .get('/api/reports/attendance')
      .query({ from: '2026-09-17', to: '2026-09-18', format: 'csv' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('attendance-report-2026-09-17-to-2026-09-18.csv');
    const dataLines = res.text.trim().split('\n');
    expect(dataLines).toHaveLength(2); // header + exactly one matching record
    expect(res.text).toContain('2026-09-17');
    expect(res.text).not.toContain('2026-09-20');
  });
});

describe('leave report date-range overlap', () => {
  test('a multi-day leave overlapping the selected range is included, non-overlapping ones are excluded', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'admin-leave@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-leave@zorx.test');
    const token = await login(admin.email);

    // Overlaps the 17-18 Sep window (starts before, ends after).
    await Leave.create({
      employeeId: employee._id,
      leaveType: LEAVE_TYPE.EARNED,
      startDate: new Date('2026-09-16'),
      endDate: new Date('2026-09-20'),
      days: 5,
      reason: 'Overlapping leave',
      status: LEAVE_STATUS.APPROVED,
    });

    // Entirely before the window — must be excluded.
    await Leave.create({
      employeeId: employee._id,
      leaveType: LEAVE_TYPE.SICK,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-02'),
      days: 2,
      reason: 'Unrelated earlier leave',
      status: LEAVE_STATUS.APPROVED,
    });

    // Entirely after the window — must be excluded.
    await Leave.create({
      employeeId: employee._id,
      leaveType: LEAVE_TYPE.CASUAL,
      startDate: new Date('2026-09-25'),
      endDate: new Date('2026-09-26'),
      days: 2,
      reason: 'Unrelated later leave',
      status: LEAVE_STATUS.APPROVED,
    });

    const res = await request(app)
      .get('/api/reports/leave')
      .query({ from: '2026-09-17', to: '2026-09-18' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reason).toBe('Overlapping leave');
  });

  test('status and leave type filters are applied', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'admin-leave2@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-leave2@zorx.test');
    const token = await login(admin.email);

    await Leave.create({
      employeeId: employee._id,
      leaveType: LEAVE_TYPE.SICK,
      startDate: new Date('2026-09-17'),
      endDate: new Date('2026-09-17'),
      days: 1,
      reason: 'Sick approved',
      status: LEAVE_STATUS.APPROVED,
    });
    await Leave.create({
      employeeId: employee._id,
      leaveType: LEAVE_TYPE.CASUAL,
      startDate: new Date('2026-09-17'),
      endDate: new Date('2026-09-17'),
      days: 1,
      reason: 'Casual pending',
      status: LEAVE_STATUS.PENDING,
    });

    const res = await request(app)
      .get('/api/reports/leave')
      .query({ status: LEAVE_STATUS.APPROVED, leaveType: LEAVE_TYPE.SICK })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reason).toBe('Sick approved');
  });
});

describe('employee report', () => {
  test('excludes SUPER_ADMIN accounts and includes email without exposing password fields', async () => {
    await createUser(ROLES.SUPER_ADMIN, 'sa-report@zorx.test');
    const { user: admin } = await createUser(ROLES.ADMIN, 'admin-emp-report@zorx.test');
    await createUser(ROLES.EMPLOYEE, 'emp-report@zorx.test');
    const token = await login(admin.email);

    const res = await request(app).get('/api/reports/employees').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const emails = res.body.data.map((e) => e.userId?.email);
    expect(emails).toContain('admin-emp-report@zorx.test');
    expect(emails).toContain('emp-report@zorx.test');
    expect(emails).not.toContain('sa-report@zorx.test');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  test('EMPLOYEE role cannot access reports', async () => {
    const { user } = await createUser(ROLES.EMPLOYEE, 'emp-noaccess@zorx.test');
    const token = await login(user.email);
    const res = await request(app).get('/api/reports/employees').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
