import mongoose from 'mongoose';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { Attendance } from '../src/models/Attendance.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import * as attendanceService from '../src/services/attendanceService.js';
import { ROLES, BREAK_TYPE } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';
const INSIDE_RADIUS_COORDS = { latitude: 10.991501, longitude: 76.442772 };

async function createEmployeeUser(email) {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role: ROLES.EMPLOYEE });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${email}`,
    firstName: 'Test',
    lastName: 'Employee',
    joiningDate: new Date(),
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
  await OfficeSettings.create({
    officeName: 'ZORX INDIA',
    latitude: 10.991401,
    longitude: 76.442772,
    attendanceRadius: 200,
    workingStartTime: '09:30',
    workingEndTime: '18:00',
    breakDurationMinutes: 60,
    timezone: 'Asia/Kolkata',
    lateThresholdMinutes: 15,
    halfDayThresholdMinutes: 240,
    overtimeEnabled: true,
  });
});

describe('break tracking — service level', () => {
  let employeeId;

  beforeEach(() => {
    employeeId = new mongoose.Types.ObjectId();
  });

  test('cannot start a break before checking in', async () => {
    await expect(attendanceService.performStartBreak(employeeId, BREAK_TYPE.TEA)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('can start a break after checking in', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    const attendance = await attendanceService.performStartBreak(employeeId, BREAK_TYPE.LUNCH);
    expect(attendance.breaks).toHaveLength(1);
    expect(attendance.breaks[0].type).toBe(BREAK_TYPE.LUNCH);
    expect(attendance.breaks[0].endTime).toBeNull();
  });

  test('cannot start a second break while already on break', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await attendanceService.performStartBreak(employeeId, BREAK_TYPE.TEA);
    await expect(attendanceService.performStartBreak(employeeId, BREAK_TYPE.LUNCH)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('double-clicking start break does not create two active breaks', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    const results = await Promise.allSettled([
      attendanceService.performStartBreak(employeeId, BREAK_TYPE.TEA),
      attendanceService.performStartBreak(employeeId, BREAK_TYPE.TEA),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const attendance = await Attendance.findOne({ employeeId });
    expect(attendance.breaks).toHaveLength(1);
  });

  test('can end an active break and duration is calculated correctly', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await attendanceService.performStartBreak(employeeId, BREAK_TYPE.TEA);

    const record = await Attendance.findOne({ employeeId });
    record.breaks[0].startTime = new Date(Date.now() - 12 * 60 * 1000); // started 12 minutes ago
    await record.save();

    const attendance = await attendanceService.performEndBreak(employeeId);
    expect(attendance.breaks[0].endTime).not.toBeNull();
    expect(attendance.breaks[0].durationMinutes).toBeGreaterThanOrEqual(11);
    expect(attendance.breaks[0].durationMinutes).toBeLessThanOrEqual(13);
  });

  test('cannot end a break when none is active', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await expect(attendanceService.performEndBreak(employeeId)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('cannot check out while a break is active', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await attendanceService.performStartBreak(employeeId, BREAK_TYPE.WASHROOM);
    await expect(attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('can check out normally after ending the break', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await attendanceService.performStartBreak(employeeId, BREAK_TYPE.WASHROOM);
    await attendanceService.performEndBreak(employeeId);
    const attendance = await attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS);
    expect(attendance.checkOut).not.toBeNull();
  });

  test('multiple breaks sum correctly and effective working time accounts for them', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);

    let record = await Attendance.findOne({ employeeId });
    record.checkIn.timestamp = new Date(Date.now() - 9 * 60 * 60 * 1000); // checked in 9 hours ago
    await record.save();

    // Break 1: 20 minutes, already completed.
    await attendanceService.performStartBreak(employeeId, BREAK_TYPE.TEA);
    record = await Attendance.findOne({ employeeId });
    record.breaks[0].startTime = new Date(Date.now() - 8 * 60 * 60 * 1000);
    await record.save();
    record.breaks[0].endTime = new Date(record.breaks[0].startTime.getTime() + 20 * 60 * 1000);
    record.breaks[0].durationMinutes = 20;
    await record.save();

    // Break 2: 25 minutes, already completed.
    await attendanceService.performStartBreak(employeeId, BREAK_TYPE.LUNCH);
    record = await Attendance.findOne({ employeeId });
    const secondBreak = record.breaks[1];
    secondBreak.startTime = new Date(Date.now() - 4 * 60 * 60 * 1000);
    secondBreak.endTime = new Date(secondBreak.startTime.getTime() + 25 * 60 * 1000);
    secondBreak.durationMinutes = 25;
    await record.save();

    const totalBreakMinutes = attendanceService.totalCompletedBreakMinutes(record);
    expect(totalBreakMinutes).toBe(45);

    const attendance = await attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS);
    expect(attendance.breakMinutes).toBe(45);
    // ~9 hours elapsed minus 45 minutes of actual break = ~495 minutes, allow small timing tolerance.
    expect(attendance.totalWorkingMinutes).toBeGreaterThanOrEqual(493);
    expect(attendance.totalWorkingMinutes).toBeLessThanOrEqual(497);
    // Allowance is 60 minutes and only 45 were used, so there is no excess.
    expect(attendance.extraBreakMinutes).toBe(0);
  });

  test('extra break time is recorded when actual breaks exceed the configured allowance', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await attendanceService.performStartBreak(employeeId, BREAK_TYPE.PERSONAL);

    const record = await Attendance.findOne({ employeeId });
    record.breaks[0].startTime = new Date(Date.now() - 72 * 60 * 1000); // 72 minutes ago
    await record.save();

    await attendanceService.performEndBreak(employeeId);
    const attendance = await attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS);

    expect(attendance.breakMinutes).toBeGreaterThanOrEqual(71);
    expect(attendance.extraBreakMinutes).toBeGreaterThanOrEqual(11); // 72 - 60 allowance, ± timing tolerance
  });
});

describe('break tracking — API / RBAC', () => {
  test("employee cannot access or affect another employee's breaks", async () => {
    await createEmployeeUser('alice@zorx.test');
    await createEmployeeUser('bob@zorx.test');

    const aliceToken = await login('alice@zorx.test');
    const bobToken = await login('bob@zorx.test');

    await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${aliceToken}`).send(INSIDE_RADIUS_COORDS);
    await request(app).post('/api/attendance/break/start').set('Authorization', `Bearer ${aliceToken}`).send({ type: 'TEA' });

    // Bob has not checked in — his own break attempt must fail on his own record, unaffected by Alice's.
    const bobBreakAttempt = await request(app)
      .post('/api/attendance/break/start')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ type: 'TEA' });
    expect(bobBreakAttempt.status).toBe(400);

    const bobToday = await request(app).get('/api/attendance/me/today').set('Authorization', `Bearer ${bobToken}`);
    expect(bobToday.body.data.attendance).toBeNull();

    const aliceToday = await request(app).get('/api/attendance/me/today').set('Authorization', `Bearer ${aliceToken}`);
    expect(aliceToday.body.data.attendance.breaks).toHaveLength(1);
  });

  test('refreshing (re-fetching) while on break preserves the active break state', async () => {
    await createEmployeeUser('carol@zorx.test');
    const token = await login('carol@zorx.test');

    await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(INSIDE_RADIUS_COORDS);
    await request(app).post('/api/attendance/break/start').set('Authorization', `Bearer ${token}`).send({ type: 'LUNCH' });

    // Simulate a page refresh: a fresh GET should still reflect the active break.
    const res = await request(app).get('/api/attendance/me/today').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.attendance.breaks).toHaveLength(1);
    expect(res.body.data.attendance.breaks[0].endTime).toBeNull();
  });

  test('rejects starting a break with an invalid type', async () => {
    await createEmployeeUser('dave@zorx.test');
    const token = await login('dave@zorx.test');
    await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(INSIDE_RADIUS_COORDS);

    const res = await request(app)
      .post('/api/attendance/break/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'NAP' });
    expect(res.status).toBe(400);
  });

  test('checkout is rejected with a friendly message while on break', async () => {
    await createEmployeeUser('erin@zorx.test');
    const token = await login('erin@zorx.test');
    await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(INSIDE_RADIUS_COORDS);
    await request(app).post('/api/attendance/break/start').set('Authorization', `Bearer ${token}`).send({ type: 'TEA' });

    const res = await request(app).post('/api/attendance/check-out').set('Authorization', `Bearer ${token}`).send(INSIDE_RADIUS_COORDS);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/end your current break/i);
  });
});
