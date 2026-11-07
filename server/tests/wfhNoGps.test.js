import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { Attendance } from '../src/models/Attendance.js';
import { WorkFromHome } from '../src/models/WorkFromHome.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { getStartOfDayUTC } from '../src/utils/dateUtils.js';
import { ROLES, WFH_STATUS, ATTENDANCE_MODE } from '../src/utils/constants.js';

// 2026-11-07 regression (Shijin P): an APPROVED WFH request for today means
// check-in and check-out work with NO GPS at all; everything else keeps the geofence.
const app = createApp();
const PASSWORD = 'Test@12345';
const OFFICE = { latitude: 10.991401, longitude: 76.442772 };
const HOME = { latitude: 9.9312, longitude: 76.2673 }; // far outside the office radius
const NEAR_OFFICE = { latitude: 10.991501, longitude: 76.442772 };
const DAY_MS = 86400000;

async function employee(email) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role: ROLES.EMPLOYEE });
  const emp = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: email.split('@')[0], lastName: 'T', joiningDate: new Date('2025-01-01') });
  user.employeeId = emp._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { employee: emp, token };
}
const wfh = (employeeId, offsetDays = 0, status = WFH_STATUS.APPROVED) =>
  WorkFromHome.create({ employeeId, date: new Date(getStartOfDayUTC().getTime() + offsetDays * DAY_MS), reason: 'Home', workPlan: 'Client work', status });
const checkIn = (t, body) => request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${t}`).send(body);
const checkOut = (t, body) => request(app).post('/api/attendance/check-out').set('Authorization', `Bearer ${t}`).send(body);
const today = (t) => request(app).get('/api/work-from-home/my/today').set('Authorization', `Bearer ${t}`);

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  await OfficeSettings.create({ officeName: 'ZORX INDIA', ...OFFICE, attendanceRadius: 200, workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: 'Asia/Kolkata', lateThresholdMinutes: 1440, halfDayThresholdMinutes: 240, overtimeEnabled: true });
});

describe('approved WFH today: no GPS needed', () => {
  test('check-in and check-out work with no coordinates at all (browser location denied)', async () => {
    const { employee: e, token } = await employee('shijin@zorx.test');
    await wfh(e._id, 0);
    expect((await today(token)).body.data).toMatchObject({ approved: true, defaultWfh: false });
    const inRes = await checkIn(token, {});
    expect(inRes.status).toBe(200);
    expect(inRes.body.data).toMatchObject({ attendanceMode: ATTENDANCE_MODE.WFH });
    expect(inRes.body.data.checkIn).toMatchObject({ latitude: null, longitude: null, distanceFromOffice: null });
    const outRes = await checkOut(token, {});
    expect(outRes.status).toBe(200);
    expect(outRes.body.data.checkOut).toMatchObject({ latitude: null, longitude: null });
  });

  test('if GPS is sent anyway it is kept for the record and the geofence is still not applied', async () => {
    const { employee: e, token } = await employee('a@zorx.test');
    await wfh(e._id, 0);
    const res = await checkIn(token, HOME);
    expect(res.status).toBe(200);
    expect(res.body.data.checkIn).toMatchObject({ latitude: HOME.latitude, longitude: HOME.longitude });
  });

  test('existing rules still apply: no duplicate check-in, no check-out before check-in', async () => {
    const { employee: e, token } = await employee('b@zorx.test');
    await wfh(e._id, 0);
    expect((await checkOut(token, {})).status).toBe(400);
    expect((await checkIn(token, {})).status).toBe(200);
    expect((await checkIn(token, {})).status).toBe(409);
  });
});

describe('everything else keeps GPS and the office geofence', () => {
  test.each([
    ['approved yesterday only (approval expired)', -1, WFH_STATUS.APPROVED],
    ['approved for tomorrow only', 1, WFH_STATUS.APPROVED],
    ['pending today', 0, WFH_STATUS.PENDING],
    ['rejected today', 0, WFH_STATUS.REJECTED],
  ])('%s → GPS required, office radius enforced', async (_, offset, status) => {
    const { employee: e, token } = await employee('c@zorx.test');
    await wfh(e._id, offset, status);
    expect((await checkIn(token, {})).status).toBe(400); // no coordinates
    expect((await checkIn(token, HOME)).status).toBe(403); // outside the office
    const ok = await checkIn(token, NEAR_OFFICE);
    expect(ok.status).toBe(200);
    expect(ok.body.data.attendanceMode).toBe(ATTENDANCE_MODE.OFFICE);
  });

  test('a series of single-day approvals: only the approved days bypass', async () => {
    const { employee: e, token } = await employee('d@zorx.test');
    await wfh(e._id, -2);
    await wfh(e._id, -1);
    await wfh(e._id, 1); // yesterday's and tomorrow's approvals never cover today
    expect((await checkIn(token, {})).status).toBe(400);
    await wfh(e._id, 0);
    expect((await checkIn(token, {})).status).toBe(200);
  });

  test("another employee's approval gives no bypass", async () => {
    const approved = await employee('approved@zorx.test');
    const office = await employee('office@zorx.test');
    await wfh(approved.employee._id, 0);
    expect((await checkIn(office.token, {})).status).toBe(400);
    expect((await checkIn(office.token, HOME)).status).toBe(403);
  });

  test('a normal office employee cannot bypass by sending WFH-looking fields', async () => {
    const { token } = await employee('e@zorx.test');
    for (const body of [{ isWFH: true }, { workFromHome: true, locationRequired: false }, { attendanceMode: 'WFH', ...HOME }]) {
      const res = await checkIn(token, body);
      expect([400, 403]).toContain(res.status);
    }
    expect(await Attendance.countDocuments()).toBe(0);
  });
});
