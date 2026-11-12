import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { Leave } from '../src/models/Leave.js';
import { Holiday } from '../src/models/Holiday.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const TOKEN = 'a'.repeat(64);
const URL = '/api/integrations/personal-manager/v1/attendance';

async function makeEmployee(email) {
  const user = await User.create({ email, passwordHash: await User.hashPassword('Test@12345'), role: ROLES.EMPLOYEE });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${email[0]}`, firstName: email.split('@')[0], lastName: 'Test', joiningDate: new Date('2024-01-15') });
  user.employeeId = employee._id;
  await user.save();
  return employee;
}
const day = (d) => new Date(`${d}T00:00:00.000Z`);
const ist = (d, t) => new Date(`${d}T${t}:00+05:30`);
const get = (q, token = TOKEN) => {
  const r = request(app).get(`${URL}${q}`);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

let me;
let other;
beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  me = await makeEmployee('ihsan@zorx.test');
  other = await makeEmployee('other@zorx.test');
  env.personalManagerIntegration.token = TOKEN;
  env.personalManagerIntegration.employeeId = String(me._id);
});

describe('Personal Manager integration — authentication', () => {
  test('answers 503 when not configured (fails closed)', async () => {
    env.personalManagerIntegration.token = '';
    expect((await get('?from=2026-11-01&to=2026-11-30')).status).toBe(503);
  });
  test('rejects a missing token', async () => {
    expect((await get('?from=2026-11-01&to=2026-11-30', null)).status).toBe(401);
  });
  test('rejects a wrong token', async () => {
    expect((await get('?from=2026-11-01&to=2026-11-30', 'b'.repeat(64))).status).toBe(401);
  });
  test('a user JWT is not accepted', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'ihsan@zorx.test', password: 'Test@12345' });
    expect((await get('?from=2026-11-01&to=2026-11-30', login.body.data.token)).status).toBe(401);
  });
});

describe('Personal Manager integration — data', () => {
  test('returns only the bound employee, ignoring any employeeId in the query', async () => {
    await Attendance.create({ employeeId: me._id, date: day('2026-11-10'), checkIn: { timestamp: ist('2026-11-10', '09:30') }, checkOut: { timestamp: ist('2026-11-10', '19:30') }, breakMinutes: 60, status: 'PRESENT' });
    await Attendance.create({ employeeId: other._id, date: day('2026-11-10'), checkIn: { timestamp: ist('2026-11-10', '09:30') }, status: 'PRESENT' });
    const res = await get(`?from=2026-11-01&to=2026-11-30&employeeId=${other._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, timezone: 'Asia/Kolkata' });
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0]).toMatchObject({
      date: '2026-11-10',
      checkIn: '2026-11-10T09:30:00+05:30',
      checkOut: '2026-11-10T19:30:00+05:30',
      breakMinutes: 60,
      overtimeBreakMinutes: 0,
      status: 'present',
    });
  });

  test('reports break time that overlaps the overtime window (after 18:00)', async () => {
    await Attendance.create({
      employeeId: me._id, date: day('2026-11-11'),
      checkIn: { timestamp: ist('2026-11-11', '09:30') }, checkOut: { timestamp: ist('2026-11-11', '20:00') },
      breaks: [
        { type: 'LUNCH', startTime: ist('2026-11-11', '13:00'), endTime: ist('2026-11-11', '14:00'), durationMinutes: 60 },
        { type: 'TEA', startTime: ist('2026-11-11', '17:50'), endTime: ist('2026-11-11', '18:10'), durationMinutes: 20 },
      ],
      breakMinutes: 80, status: 'PRESENT',
    });
    const res = await get('?from=2026-11-11&to=2026-11-11');
    expect(res.body.records[0].overtimeBreakMinutes).toBe(10);
    expect(res.body.records[0].breaks).toHaveLength(2);
  });

  test('fills approved leave and holidays; attendance wins on its own day; pending leave ignored', async () => {
    await Leave.create({ employeeId: me._id, leaveType: 'CASUAL', startDate: day('2026-11-03'), endDate: day('2026-11-04'), days: 2, reason: 'x', status: 'APPROVED' });
    await Leave.create({ employeeId: me._id, leaveType: 'SICK', startDate: day('2026-11-06'), endDate: day('2026-11-06'), days: 1, reason: 'x', status: 'PENDING' });
    await Holiday.create({ date: day('2026-11-05'), name: 'Festival', createdBy: me.userId });
    await Holiday.create({ date: day('2026-11-04'), name: 'Overlaps leave', createdBy: me.userId });
    await Attendance.create({ employeeId: me._id, date: day('2026-11-03'), checkIn: { timestamp: ist('2026-11-03', '09:30') }, status: 'PRESENT' });
    const res = await get('?from=2026-11-01&to=2026-11-30');
    const byDate = Object.fromEntries(res.body.records.map((r) => [r.date, r]));
    expect(byDate['2026-11-03']).toMatchObject({ status: 'present', source: 'attendance', checkOut: null });
    expect(byDate['2026-11-04']).toMatchObject({ status: 'leave', source: 'leave' });
    expect(byDate['2026-11-05']).toMatchObject({ status: 'holiday', holidayName: 'Festival' });
    expect(byDate['2026-11-06']).toBeUndefined();
  });

  test('is read-only (no documents change)', async () => {
    await Attendance.create({ employeeId: me._id, date: day('2026-11-10'), checkIn: { timestamp: ist('2026-11-10', '09:30') }, status: 'PRESENT' });
    const before = JSON.stringify(await Attendance.find().lean());
    await get('?from=2026-11-01&to=2026-11-30');
    expect(JSON.stringify(await Attendance.find().lean())).toBe(before);
  });

  test.each([
    ['missing dates', ''],
    ['malformed date', '?from=01-11-2026&to=2026-11-30'],
    ['impossible date', '?from=2026-02-30&to=2026-03-01'],
    ['reversed range', '?from=2026-11-30&to=2026-11-01'],
    ['range too long', '?from=2026-01-01&to=2026-12-31'],
  ])('rejects %s with 400', async (_, q) => {
    expect((await get(q)).status).toBe(400);
  });
});
