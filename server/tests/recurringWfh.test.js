import { jest } from '@jest/globals';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { isSecondSaturday, recurringWfhPolicyFor, resolveWfhSource, WFH_SOURCE } from '../src/services/wfhService.js';
import { RECURRING_WFH_POLICIES } from '../src/config/wfhPolicies.js';
import { ROLES, WORK_MODE } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const SHIJIN_ID = '6aabba950573c80dc46eb6bc'; // the configured policy's employee
const HOME = { latitude: 9.9312, longitude: 76.2673 }; // far outside the office radius
const day = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const ist = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+05:30`);

// Only Date is faked (timers stay real, so the database driver keeps working).
const setNow = (date) =>
  jest.useFakeTimers({ now: date, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'] });

async function setup(email, { _id, workMode } = {}) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role: ROLES.EMPLOYEE });
  const employee = await Employee.create({ ...(_id ? { _id } : {}), userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 7)}`, firstName: email.split('@')[0], lastName: 'P', joiningDate: new Date('2024-01-15'), ...(workMode ? { workMode } : {}) });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { employee, token };
}
/** Logs in at the (faked) current time, so the token is valid "now". */
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
const checkIn = (token, coords) => request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(coords);
const checkOut = (token, coords) => request(app).post('/api/attendance/check-out').set('Authorization', `Bearer ${token}`).send(coords);

beforeAll(async () => {
  await startTestDb();
});
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  await OfficeSettings.create({ officeName: 'ZORX INDIA', latitude: 10.991401, longitude: 76.442772, attendanceRadius: 200, workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: 'Asia/Kolkata', lateThresholdMinutes: 15, halfDayThresholdMinutes: 240, overtimeEnabled: true });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('second Saturday rule (computed, no date list)', () => {
  test('exactly one second Saturday per month, every month of 2026–2028, on day 8–14', () => {
    for (let y = 2026; y <= 2028; y += 1) {
      for (let m = 0; m < 12; m += 1) {
        const days = Array.from({ length: new Date(Date.UTC(y, m + 1, 0)).getUTCDate() }, (_, i) => new Date(Date.UTC(y, m, i + 1)));
        const saturdays = days.filter((d) => d.getUTCDay() === 6);
        expect(days.filter(isSecondSaturday)).toEqual([saturdays[1]]);
      }
    }
  });

  test('October 2026: the 10th yes; the 3rd, 17th, 24th and 31st no; weekdays never', () => {
    expect(isSecondSaturday(day('2026-10-10'))).toBe(true);
    for (const d of ['2026-10-03', '2026-10-17', '2026-10-24', '2026-10-31', '2026-10-09', '2026-10-11', '2026-10-14']) expect(isSecondSaturday(day(d))).toBe(false);
  });

  test('the policy is configured for Shijin P only and matches only his id', () => {
    expect(RECURRING_WFH_POLICIES).toEqual([{ employeeId: SHIJIN_ID, rule: 'SECOND_SATURDAY', workingStartTime: '09:30', workingEndTime: '18:00' }]);
    expect(recurringWfhPolicyFor(SHIJIN_ID, day('2026-10-10'))).toMatchObject({ rule: 'SECOND_SATURDAY' });
    expect(recurringWfhPolicyFor(SHIJIN_ID, day('2026-10-17'))).toBeNull();
    expect(recurringWfhPolicyFor('64b000000000000000000000', day('2026-10-10'))).toBeNull();
    expect(recurringWfhPolicyFor(null, day('2026-10-10'))).toBeNull();
  });
});

describe('check-in / check-out enforcement (backend)', () => {
  test('Shijin on a second Saturday: check-in and check-out from home succeed and are WFH', async () => {
    setNow(ist('2026-11-14', '09:40'));
    const { employee, token } = await setup('shijin@zorx.test', { _id: SHIJIN_ID });
    expect(await resolveWfhSource(employee._id, day('2026-11-14'))).toBe(WFH_SOURCE.RECURRING_POLICY);
    const inRes = await checkIn(token, HOME);
    expect(inRes.status).toBe(200);
    expect(inRes.body.data).toMatchObject({ attendanceMode: 'WFH', status: 'PRESENT', lateMinutes: 0 });
    expect(inRes.body.data.checkIn.distanceFromOffice).toBeGreaterThan(200); // GPS still recorded
    expect((await checkIn(token, HOME)).status).toBe(409); // duplicate-punch protection unchanged
    setNow(ist('2026-11-14', '18:00'));
    const outRes = await checkOut(await login('shijin@zorx.test'), HOME); // tokens last 8h
    expect(outRes.status).toBe(200);
    // Existing calculation: elapsed minus ACTUAL recorded breaks (none here) — no break is invented.
    expect(outRes.body.data).toMatchObject({ attendanceMode: 'WFH', breakMinutes: 0, totalWorkingMinutes: 500 });
    expect(await Attendance.countDocuments({ employeeId: employee._id })).toBe(1);
  });

  test('Shijin on a second Saturday is late against the 9:30 schedule with the normal grace', async () => {
    setNow(ist('2026-11-14', '09:50'));
    const { token } = await setup('shijin@zorx.test', { _id: SHIJIN_ID });
    expect((await checkIn(token, HOME)).body.data).toMatchObject({ status: 'LATE', lateMinutes: 5 });
  });

  test('Shijin on other Saturdays and weekdays: the normal office radius check still applies', async () => {
    setNow(ist('2026-11-07', '09:00'));
    await setup('shijin@zorx.test', { _id: SHIJIN_ID });
    for (const d of ['2026-11-07', '2026-11-21', '2026-11-28', '2026-11-13']) {
      setNow(ist(d, '09:30'));
      const res = await checkIn(await login('shijin@zorx.test'), HOME);
      expect(res.status).toBe(403); // outside the office radius, as for everyone
    }
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('other employees get nothing on the second Saturday; Aysha-style permanent WFH is unchanged', async () => {
    setNow(ist('2026-11-14', '09:30'));
    const other = await setup('other@zorx.test');
    const permanent = await setup('aysha@zorx.test', { workMode: WORK_MODE.WFH });
    expect((await checkIn(other.token, HOME)).status).toBe(403);
    const p = await checkIn(permanent.token, {});
    expect(p.status).toBe(200);
    expect(p.body.data.attendanceMode).toBe('WFH');
    expect(await resolveWfhSource(permanent.employee._id, day('2026-11-14'))).toBe(WFH_SOURCE.DEFAULT);
  });
});

describe('employee-facing status', () => {
  test('"WFH today" is on for Shijin on the second Saturday only, with the rule for the calendar', async () => {
    setNow(ist('2026-11-14', '08:00'));
    const shijin = await setup('shijin@zorx.test', { _id: SHIJIN_ID });
    const other = await setup('other@zorx.test');
    const today = (t) => request(app).get('/api/work-from-home/my/today').set('Authorization', `Bearer ${t}`);
    expect((await today(shijin.token)).body.data).toMatchObject({ approved: true, defaultWfh: false, recurringToday: true, recurringRule: 'SECOND_SATURDAY' });
    expect((await today(other.token)).body.data).toMatchObject({ approved: false, recurringToday: false, recurringRule: null });
    setNow(ist('2026-11-21', '08:00'));
    expect((await today(await login('shijin@zorx.test'))).body.data).toMatchObject({ approved: false, recurringToday: false, recurringRule: 'SECOND_SATURDAY' });
  });
});
