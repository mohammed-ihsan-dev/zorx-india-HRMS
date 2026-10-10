import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { minutesSinceMidnight } from '../src/utils/dateUtils.js';
import { ROLES, WORK_MODE, ATTENDANCE_STATUS } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const INSIDE_RADIUS_COORDS = { latitude: 10.991501, longitude: 76.442772 };
const GRACE = 15;

function hhmm(totalMinutes) {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

async function setup(role, email, employeeFields = {}) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`,
    firstName: role,
    lastName: 'Test',
    joiningDate: new Date('2025-01-01'),
    ...employeeFields,
  });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { employee, token };
}

const checkIn = (token, body = INSIDE_RADIUS_COORDS) =>
  request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(body);

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  // Office start is 60 minutes ago, so anyone on the office schedule is late right now.
  await OfficeSettings.create({
    officeName: 'ZORX INDIA',
    latitude: 10.991401,
    longitude: 76.442772,
    attendanceRadius: 200,
    workingStartTime: hhmm(minutesSinceMidnight() - 60),
    workingEndTime: '23:59',
    breakDurationMinutes: 60,
    timezone: 'Asia/Kolkata',
    lateThresholdMinutes: GRACE,
    halfDayThresholdMinutes: 240,
    overtimeEnabled: true,
  });
});

describe('per-employee official check-in time', () => {
  test('an employee with a later official start is on time while office-schedule colleagues are late', async () => {
    const own = await setup(ROLES.EMPLOYEE, 'late-start@zorx.test', { workingStartTime: hhmm(minutesSinceMidnight() + 30) });
    const normal = await setup(ROLES.EMPLOYEE, 'normal@zorx.test');

    const ownRes = await checkIn(own.token);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.data.status).toBe(ATTENDANCE_STATUS.PRESENT);
    expect(ownRes.body.data.lateMinutes).toBe(0);

    const normalRes = await checkIn(normal.token);
    expect(normalRes.body.data.status).toBe(ATTENDANCE_STATUS.LATE);
    expect(normalRes.body.data.lateMinutes).toBeGreaterThanOrEqual(60 - GRACE - 1);
  });

  test('the office grace period still applies on top of the employee start time', async () => {
    const withinGrace = await setup(ROLES.EMPLOYEE, 'within@zorx.test', { workingStartTime: hhmm(minutesSinceMidnight() - (GRACE - 5)) });
    const pastGrace = await setup(ROLES.EMPLOYEE, 'past@zorx.test', { workingStartTime: hhmm(minutesSinceMidnight() - (GRACE + 20)) });

    expect((await checkIn(withinGrace.token)).body.data.status).toBe(ATTENDANCE_STATUS.PRESENT);
    const late = (await checkIn(pastGrace.token)).body.data;
    expect(late.status).toBe(ATTENDANCE_STATUS.LATE);
    expect(late.lateMinutes).toBeGreaterThanOrEqual(19);
    expect(late.lateMinutes).toBeLessThanOrEqual(21);
  });

  test('works together with permanent WFH (no location)', async () => {
    const remote = await setup(ROLES.EMPLOYEE, 'remote@zorx.test', {
      workMode: WORK_MODE.WFH,
      workingStartTime: hhmm(minutesSinceMidnight() + 30),
    });
    const res = await checkIn(remote.token, {});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(ATTENDANCE_STATUS.PRESENT);
    expect(res.body.data.attendanceMode).toBe('WFH');
  });

  test('employees without an override keep the office start time (field defaults to null)', async () => {
    const { employee } = await setup(ROLES.EMPLOYEE, 'plain@zorx.test');
    expect((await Employee.findById(employee._id)).workingStartTime).toBeNull();
  });
});

describe('managing the official check-in time', () => {
  test('an admin can set, validate and clear it', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    const { employee } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    const patch = (body) =>
      request(app).patch(`/api/employees/${employee._id}`).set('Authorization', `Bearer ${admin.token}`).send(body);

    expect((await patch({ workingStartTime: '10:00' })).body.data.workingStartTime).toBe('10:00');
    expect((await patch({ workingStartTime: '25:00' })).status).toBe(400);
    expect((await patch({ workingStartTime: '10am' })).status).toBe(400);
    expect((await patch({ workingStartTime: '' })).body.data.workingStartTime).toBeNull();
  });

  test('an employee cannot set their own official check-in time', async () => {
    const { employee, token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    await request(app).patch('/api/employees/me/profile').set('Authorization', `Bearer ${token}`).send({ workingStartTime: '12:00' });
    expect((await Employee.findById(employee._id)).workingStartTime).toBeNull();
    const direct = await request(app)
      .patch(`/api/employees/${employee._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workingStartTime: '12:00' });
    expect(direct.status).toBe(403);
  });
});
