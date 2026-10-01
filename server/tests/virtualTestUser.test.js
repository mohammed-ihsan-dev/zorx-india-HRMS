import './virtualTestUserEnv.js';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Leave } from '../src/models/Leave.js';
import { LeaveBalance } from '../src/models/LeaveBalance.js';
import { Attendance } from '../src/models/Attendance.js';
import { env } from '../src/config/env.js';
import { ROLES } from '../src/utils/constants.js';
import {
  VIRTUAL_USER_ID,
  VIRTUAL_EMPLOYEE_ID,
  isVirtualTestUserEnabled,
  matchesVirtualTestCredentials,
  setVirtualAttendanceSnapshot,
} from '../src/utils/virtualTestUser.js';

const app = createApp();
const VIRTUAL_EMAIL = 'virtualtest@zorx.test';
const VIRTUAL_PASSWORD = 'virtual-pass-123';
const REAL_PASSWORD = 'RealEmployee@123';
const OFFICE_COORDS = { latitude: env.office.latitude, longitude: env.office.longitude };

async function createRealUser(role, email) {
  const passwordHash = await User.hashPassword(REAL_PASSWORD);
  const user = await User.create({ email, passwordHash, role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`,
    firstName: role,
    lastName: 'Test',
    joiningDate: new Date('2025-01-01'),
  });
  user.employeeId = employee._id;
  await user.save();
  return { user, employee };
}

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res;
}

async function loginAsVirtualUser() {
  const res = await login(VIRTUAL_EMAIL, VIRTUAL_PASSWORD);
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
  // The virtual attendance snapshot is a single process-wide in-memory slot
  // (by design — see virtualTestUser.js), so it must be reset between tests
  // in this file or an earlier test's check-in would leak into a later one.
  setVirtualAttendanceSnapshot(null);
});

describe('virtual test user: login and identity', () => {
  test('logs in successfully with the configured virtual credentials', async () => {
    const res = await login(VIRTUAL_EMAIL, VIRTUAL_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.isVirtualTestUser).toBe(true);
    expect(res.body.data.user.role).toBe(ROLES.EMPLOYEE);
  });

  test('rejects the wrong password for the virtual account', async () => {
    const res = await login(VIRTUAL_EMAIL, 'wrong-password');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('creates no User or Employee document in the database', async () => {
    await loginAsVirtualUser();
    const userCount = await User.countDocuments({});
    const employeeCount = await Employee.countDocuments({});
    expect(userCount).toBe(0);
    expect(employeeCount).toBe(0);
  });

  test('GET /api/auth/me reflects the virtual profile without touching the database', async () => {
    const token = await loginAsVirtualUser();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isVirtualTestUser).toBe(true);
    expect(res.body.data.id).toBe(VIRTUAL_USER_ID.toString());
    expect(res.body.data.employee._id).toBe(VIRTUAL_EMPLOYEE_ID.toString());
  });

  test('changePassword is blocked for the virtual account instead of crashing', async () => {
    const token = await loginAsVirtualUser();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: VIRTUAL_PASSWORD, newPassword: 'NewPassword@123' });
    expect(res.status).toBe(400);
  });
});

describe('virtual test user: admin invisibility', () => {
  test('does not appear in the admin employee directory and does not affect the count', async () => {
    await createRealUser(ROLES.EMPLOYEE, 'real1@zorx.test');
    await createRealUser(ROLES.ADMIN, 'admin1@zorx.test');
    await loginAsVirtualUser();

    const adminToken = (await login('admin1@zorx.test', REAL_PASSWORD)).body.data.token;
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Two real Employee docs exist (the EMPLOYEE and the ADMIN created above,
    // which the directory doesn't exclude) — the point of this assertion is
    // that the virtual user adds no third entry and isn't in the list.
    expect(res.body.meta.total).toBe(2);
    const ids = res.body.data.map((e) => e._id);
    expect(ids).not.toContain(VIRTUAL_EMPLOYEE_ID.toString());
  });

  test('a simulated check-in does not appear in the admin attendance listing', async () => {
    await createRealUser(ROLES.ADMIN, 'admin2@zorx.test');
    const virtualToken = await loginAsVirtualUser();
    await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${virtualToken}`)
      .send(OFFICE_COORDS);

    const adminToken = (await login('admin2@zorx.test', REAL_PASSWORD)).body.data.token;
    const res = await request(app).get('/api/attendance').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const employeeIds = (res.body.data.items || res.body.data || []).map((r) => String(r.employeeId?._id || r.employeeId));
    expect(employeeIds).not.toContain(VIRTUAL_EMPLOYEE_ID.toString());
    const attendanceCount = await Attendance.countDocuments({});
    expect(attendanceCount).toBe(0);
  });
});

describe('virtual test user: non-persisted attendance writes', () => {
  test('check-in returns a simulated success and writes no Attendance document', async () => {
    const token = await loginAsVirtualUser();
    const res = await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(OFFICE_COORDS);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/not saved/i);
    expect(res.body.data.checkIn).toBeTruthy();
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('full check-in -> break -> check-out cycle stays in-memory only', async () => {
    const token = await loginAsVirtualUser();
    await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(OFFICE_COORDS);
    const breakStart = await request(app)
      .post('/api/attendance/break/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'TEA' });
    expect(breakStart.status).toBe(200);

    const breakEnd = await request(app).post('/api/attendance/break/end').set('Authorization', `Bearer ${token}`);
    expect(breakEnd.status).toBe(200);

    const checkOut = await request(app).post('/api/attendance/check-out').set('Authorization', `Bearer ${token}`).send(OFFICE_COORDS);
    expect(checkOut.status).toBe(200);
    expect(checkOut.body.data.checkOut).toBeTruthy();

    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('GET /api/attendance/me/today reflects the simulated snapshot', async () => {
    const token = await loginAsVirtualUser();
    await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(OFFICE_COORDS);
    const res = await request(app).get('/api/attendance/me/today').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.attendance.checkIn).toBeTruthy();
  });

  test('POST /api/attendance/virtual/reset resets the virtual snapshot and writes no documents', async () => {
    const token = await loginAsVirtualUser();
    await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(OFFICE_COORDS);
    let today = await request(app).get('/api/attendance/me/today').set('Authorization', `Bearer ${token}`);
    expect(today.body.data.attendance.checkIn).toBeTruthy();

    const resetRes = await request(app).post('/api/attendance/virtual/reset').set('Authorization', `Bearer ${token}`);
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toMatch(/reset successfully/i);

    today = await request(app).get('/api/attendance/me/today').set('Authorization', `Bearer ${token}`);
    expect(today.body.data.attendance).toBeNull();
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('POST /api/attendance/virtual/reset is strictly forbidden for real employees', async () => {
    await createRealUser(ROLES.EMPLOYEE, 'realemployee@zorx.test');
    const loginRes = await login('realemployee@zorx.test', REAL_PASSWORD);
    const realToken = loginRes.body.data.token;

    const res = await request(app).post('/api/attendance/virtual/reset').set('Authorization', `Bearer ${realToken}`);
    expect(res.status).toBe(403);
  });

  test('POST /api/attendance/virtual/reset rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/attendance/virtual/reset');
    expect(res.status).toBe(401);
  });
});

describe('virtual test user: non-persisted leave writes', () => {
  test('leave submission returns a simulated success and writes no Leave/LeaveBalance document', async () => {
    const token = await loginAsVirtualUser();
    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({ leaveType: 'CASUAL', startDate: '2026-11-10', endDate: '2026-11-10', reason: 'Testing' });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/not saved/i);
    expect(await Leave.countDocuments({})).toBe(0);
    expect(await LeaveBalance.countDocuments({})).toBe(0);
  });

  test('GET /api/leaves/me returns an empty list and a safe balance without creating a LeaveBalance document', async () => {
    const token = await loginAsVirtualUser();
    const res = await request(app).get('/api/leaves/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.leaves).toEqual([]);
    expect(res.body.data.balance).toBeTruthy();
    expect(await LeaveBalance.countDocuments({})).toBe(0);
  });
});

describe('virtual test user: blocked writes with no simulation', () => {
  test('edit request creation is rejected, not persisted', async () => {
    const token = await loginAsVirtualUser();
    const res = await request(app)
      .post('/api/edit-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ field: 'PHONE', currentValue: '1111111111', requestedValue: '2222222222', reason: 'test' });
    expect(res.status).toBe(400);
  });

  test('client creation is rejected, not persisted', async () => {
    const token = await loginAsVirtualUser();
    const res = await request(app).post('/api/clients').set('Authorization', `Bearer ${token}`).send({ name: 'Virtual Client' });
    expect(res.status).toBe(400);
  });

  test('client listing (read) still works for the virtual user', async () => {
    const token = await loginAsVirtualUser();
    const res = await request(app).get('/api/clients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('virtual test user: feature flag gating', () => {
  const originalEnabled = env.testUser.enabled;
  const originalNodeEnv = env.nodeEnv;
  const originalAllowInProduction = env.testUser.allowInProduction;

  afterEach(() => {
    env.testUser.enabled = originalEnabled;
    env.nodeEnv = originalNodeEnv;
    env.testUser.allowInProduction = originalAllowInProduction;
  });

  test('is disabled entirely when TEST_USER_ENABLED is false', () => {
    env.testUser.enabled = false;
    expect(isVirtualTestUserEnabled()).toBe(false);
    expect(matchesVirtualTestCredentials(VIRTUAL_EMAIL, VIRTUAL_PASSWORD)).toBe(false);
  });

  test('login is rejected with the generic invalid-credentials message when disabled', async () => {
    env.testUser.enabled = false;
    const res = await login(VIRTUAL_EMAIL, VIRTUAL_PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.message).not.toMatch(/virtual/i);
  });

  test('an already-issued virtual token is rejected the instant the flag is disabled', async () => {
    const token = await loginAsVirtualUser();
    env.testUser.enabled = false;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('requires an additional production opt-in even when TEST_USER_ENABLED is true', () => {
    env.testUser.enabled = true;
    env.nodeEnv = 'production';
    env.testUser.allowInProduction = false;
    expect(isVirtualTestUserEnabled()).toBe(false);

    env.testUser.allowInProduction = true;
    expect(isVirtualTestUserEnabled()).toBe(true);
  });
});
