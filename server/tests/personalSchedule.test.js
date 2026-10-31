import { jest } from '@jest/globals';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { effectiveSchedule } from '../src/services/attendanceService.js';
import { ROLES } from '../src/utils/constants.js';

// Personal schedule for one employee (e.g. Dubai, 10–6 local = 11:30–19:30 IST,
// 7h target, overtime after 7 PM Dubai = 20:30 IST); everyone else unchanged.
const app = createApp();
const PASSWORD = 'Test@12345';
const OFFICE = { latitude: 10.991401, longitude: 76.442772 };
const SITE = { name: 'Dubai site', latitude: 25.189377, longitude: 55.256574, radiusMeters: 200, active: true };
const DUBAI = { workingStartTime: '11:30', workingEndTime: '19:30', dailyTargetMinutes: 420, overtimeCutoffTime: '20:30', attendanceLocation: SITE };
const ist = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+05:30`);
const setNow = (d) =>
  jest.useFakeTimers({ now: d, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'] });

async function setup(email, extra = {}, role = ROLES.EMPLOYEE) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 7)}`, firstName: email.split('@')[0], lastName: 'T', joiningDate: new Date('2024-01-15'), ...extra });
  user.employeeId = employee._id;
  await user.save();
  return { user, employee, email };
}
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const punch = async (email, kind, coords) => request(app).post(`/api/attendance/check-${kind}`).set(auth(await login(email))).send(coords);

beforeAll(async () => {
  await startTestDb();
});
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  await OfficeSettings.create({ officeName: 'ZORX INDIA', ...OFFICE, attendanceRadius: 200, workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: 'Asia/Kolkata', lateThresholdMinutes: 15, halfDayThresholdMinutes: 240, overtimeEnabled: true });
});
afterEach(() => jest.useRealTimers());

test('effective schedule: personal values where set, office defaults otherwise', () => {
  const office = { workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60 };
  expect(effectiveSchedule({}, office)).toEqual({ workingStartTime: '09:30', workingEndTime: '18:00', dailyTargetMinutes: 450, overtimeCutoffTime: '19:00', personal: false });
  expect(effectiveSchedule(DUBAI, office)).toEqual({ workingStartTime: '11:30', workingEndTime: '19:30', dailyTargetMinutes: 420, overtimeCutoffTime: '20:30', personal: true });
});

test('late is measured from 10:00 Dubai (11:30 IST) with the normal grace', async () => {
  await setup('rifan@zorx.test', DUBAI);
  setNow(ist('2026-11-02', '11:44'));
  expect((await punch('rifan@zorx.test', 'in', SITE)).body.data).toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
  await Attendance.deleteMany({});
  setNow(ist('2026-11-03', '11:50'));
  expect((await punch('rifan@zorx.test', 'in', SITE)).body.data).toMatchObject({ status: 'LATE', lateMinutes: 5 });
});

test('check-out overtime is measured against his 7h target; office staff still against 7h 30m', async () => {
  await setup('rifan@zorx.test', DUBAI);
  await setup('office@zorx.test');
  setNow(ist('2026-11-02', '11:30'));
  await punch('rifan@zorx.test', 'in', SITE);
  setNow(ist('2026-11-02', '09:30'));
  await punch('office@zorx.test', 'in', OFFICE);
  setNow(ist('2026-11-02', '19:30')); // 6 PM Dubai; 8h elapsed for him
  expect((await punch('rifan@zorx.test', 'out', SITE)).body.data).toMatchObject({ totalWorkingMinutes: 480, overtimeMinutes: 60 });
  setNow(ist('2026-11-02', '17:30')); // 8h elapsed for the office employee too
  expect((await punch('office@zorx.test', 'out', OFFICE)).body.data).toMatchObject({ totalWorkingMinutes: 480, overtimeMinutes: 30 });
});

test('dashboard schedule from the today endpoint', async () => {
  await setup('rifan@zorx.test', DUBAI);
  await setup('office@zorx.test');
  const today = async (email) => (await request(app).get('/api/attendance/me/today').set(auth(await login(email)))).body.data.schedule;
  expect(await today('rifan@zorx.test')).toMatchObject({ workingStartTime: '11:30', workingEndTime: '19:30', dailyTargetMinutes: 420, overtimeCutoffTime: '20:30' });
  expect(await today('office@zorx.test')).toMatchObject({ workingStartTime: '09:30', workingEndTime: '18:00', dailyTargetMinutes: 450, overtimeCutoffTime: '19:00' });
});

test('"overtime after 7 PM" uses 7 PM Dubai (20:30 IST) for him only — calendar and Salary Report', async () => {
  const rifan = await setup('rifan@zorx.test', DUBAI);
  const office = await setup('office@zorx.test');
  const admin = await setup('hr@zorx.test', {}, ROLES.ADMIN);
  for (const e of [rifan, office]) {
    await Attendance.create({ employeeId: e.employee._id, date: new Date('2026-10-29T00:00:00.000Z'), checkIn: { timestamp: ist('2026-10-29', '11:30') }, checkOut: { timestamp: ist('2026-10-29', '20:45') }, status: 'PRESENT' });
  }
  const hist = async (email) => (await request(app).get('/api/attendance/me').set(auth(await login(email))).query({ from: '2026-10-01', to: '2026-10-31' })).body.data[0].overtimeAfter7Minutes;
  expect(await hist('rifan@zorx.test')).toBe(15); // 20:30 → 20:45 IST
  expect(await hist('office@zorx.test')).toBe(105); // 19:00 → 20:45 IST
  const report = (await request(app).get('/api/reports/salary').set(auth(await login(admin.email))).query({ month: '2026-10' })).body.data;
  expect(Object.fromEntries(report.map((r) => [r.employeeName, r.overtime]))).toEqual({ 'rifan T': '00h 15m', 'office T': '01h 45m' });
});

test('only HR/Admin can set it; values are validated; employees cannot change their own', async () => {
  const admin = await setup('hr@zorx.test', {}, ROLES.ADMIN);
  const emp = await setup('rifan@zorx.test');
  const patch = async (body) => request(app).patch(`/api/employees/${emp.employee._id}`).set(auth(await login(admin.email))).send(body);
  expect((await patch({ workingEndTime: '25:00' })).status).toBe(400);
  expect((await patch({ dailyTargetMinutes: 30 })).status).toBe(400);
  expect((await patch({ overtimeCutoffTime: 'evening' })).status).toBe(400);
  expect((await patch({ workingEndTime: '19:30', dailyTargetMinutes: 420, overtimeCutoffTime: '20:30' })).status).toBe(200);
  expect((await patch({ workingEndTime: '', dailyTargetMinutes: '', overtimeCutoffTime: null })).status).toBe(200);
  expect(await Employee.findById(emp.employee._id).select('workingEndTime dailyTargetMinutes overtimeCutoffTime').lean()).toMatchObject({ workingEndTime: null, dailyTargetMinutes: null, overtimeCutoffTime: null });
  await request(app).patch('/api/employees/me/profile').set(auth(await login(emp.email))).send({ dailyTargetMinutes: 60, overtimeCutoffTime: '10:00' });
  expect(await Employee.findById(emp.employee._id).select('dailyTargetMinutes overtimeCutoffTime').lean()).toMatchObject({ dailyTargetMinutes: null, overtimeCutoffTime: null });
});
