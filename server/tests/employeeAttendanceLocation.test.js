import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { ROLES } from '../src/utils/constants.js';

// Per-employee attendance site: same validateLocation (Haversine + radius),
// different centre/radius for the assigned employee only.
const app = createApp();
const PASSWORD = 'Test@12345';
const OFFICE = { latitude: 10.991401, longitude: 76.442772 };
const SITE = { name: 'Remote Site', latitude: 25.2241, longitude: 55.2823, radiusMeters: 100, active: true }; // test values
const metresNorth = (p, m) => ({ latitude: p.latitude + m / 111320, longitude: p.longitude });

async function setup(email, role = ROLES.EMPLOYEE, extra = {}) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 7)}`, firstName: email.split('@')[0], lastName: 'T', joiningDate: new Date('2024-01-15'), ...extra });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const checkIn = (t, coords) => request(app).post('/api/attendance/check-in').set(auth(t)).send(coords);
const checkOut = (t, coords) => request(app).post('/api/attendance/check-out').set(auth(t)).send(coords);

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

describe('validation against the assigned site', () => {
  test('inside their site: check-in and check-out succeed; distance is from the site', async () => {
    const { token } = await setup('rifan@zorx.test', ROLES.EMPLOYEE, { attendanceLocation: SITE });
    const here = metresNorth(SITE, 30);
    const inRes = await checkIn(token, here);
    expect(inRes.status).toBe(200);
    expect(inRes.body.data.checkIn.distanceFromOffice).toBe(30);
    expect(inRes.body.data.attendanceMode).toBe('OFFICE');
    const outRes = await checkOut(token, here);
    expect(outRes.status).toBe(200);
    expect(outRes.body.data.checkOut.distanceFromOffice).toBe(30);
  });

  test('outside their site is rejected — including at the main office', async () => {
    const { token } = await setup('rifan@zorx.test', ROLES.EMPLOYEE, { attendanceLocation: SITE });
    const atOffice = await checkIn(token, OFFICE);
    expect(atOffice.status).toBe(403);
    expect(atOffice.body.message).toMatch(/outside the Remote Site attendance area/);
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('check-out is validated too', async () => {
    const { token } = await setup('rifan@zorx.test', ROLES.EMPLOYEE, { attendanceLocation: SITE });
    expect((await checkIn(token, SITE)).status).toBe(200);
    expect((await checkOut(token, OFFICE)).status).toBe(403);
    expect((await Attendance.findOne({})).checkOut).toBeNull();
  });

  test('radius boundary: just inside allowed, just outside rejected', async () => {
    const { token } = await setup('rifan@zorx.test', ROLES.EMPLOYEE, { attendanceLocation: SITE });
    expect((await checkIn(token, metresNorth(SITE, 105))).status).toBe(403);
    expect((await checkIn(token, metresNorth(SITE, 95))).status).toBe(200);
  });

  test('missing or invalid coordinates are rejected (e.g. GPS permission denied)', async () => {
    const { token } = await setup('rifan@zorx.test', ROLES.EMPLOYEE, { attendanceLocation: SITE });
    expect((await checkIn(token, {})).status).toBe(400);
    expect((await checkIn(token, { latitude: 999, longitude: 0 })).status).toBe(400);
    expect((await checkIn(token, { latitude: 'x', longitude: 'y' })).status).toBe(400);
  });

  test('main-office employees are unchanged and cannot use the other site', async () => {
    const { token } = await setup('office@zorx.test');
    expect((await checkIn(token, SITE)).status).toBe(403);
    const ok = await checkIn(token, metresNorth(OFFICE, 50));
    expect(ok.status).toBe(200);
    expect(ok.body.data.checkIn.distanceFromOffice).toBe(50);
  });

  test('an inactive site falls back to the main office', async () => {
    const { token } = await setup('rifan@zorx.test', ROLES.EMPLOYEE, { attendanceLocation: { ...SITE, active: false } });
    expect((await checkIn(token, SITE)).status).toBe(403);
    expect((await checkIn(token, OFFICE)).status).toBe(200);
  });

  test('in office Wi-Fi mode, the assigned-site employee is still GPS-checked against their site', async () => {
    await OfficeSettings.updateOne({}, { $set: { attendanceVerificationMode: 'WIFI' } });
    const remote = await setup('rifan@zorx.test', ROLES.EMPLOYEE, { attendanceLocation: SITE });
    expect((await checkIn(remote.token, OFFICE)).status).toBe(403);
    expect((await checkIn(remote.token, SITE)).status).toBe(200);
  });
});

describe('who can set it', () => {
  test('HR/Admin can set, validate and remove a site; the today endpoint reports its name and radius', async () => {
    const admin = await setup('hr@zorx.test', ROLES.ADMIN);
    const emp = await setup('rifan@zorx.test');
    const patch = (body) => request(app).patch(`/api/employees/${emp.employee._id}`).set(auth(admin.token)).send(body);
    expect((await patch({ attendanceLocation: { ...SITE, latitude: 200 } })).status).toBe(400);
    expect((await patch({ attendanceLocation: { ...SITE, radiusMeters: 5 } })).status).toBe(400);
    expect((await patch({ attendanceLocation: SITE })).status).toBe(200);
    const today = await request(app).get('/api/attendance/me/today').set(auth(emp.token));
    expect(today.body.data.attendanceLocation).toEqual({ name: 'Remote Site', radiusMeters: 100 });
    expect((await patch({ attendanceLocation: null })).status).toBe(200);
    expect((await request(app).get('/api/attendance/me/today').set(auth(emp.token))).body.data.attendanceLocation).toBeNull();
  });

  test('employees cannot set or change their own site', async () => {
    const emp = await setup('rifan@zorx.test');
    const self = await request(app).patch('/api/employees/me/profile').set(auth(emp.token)).send({ phone: '123', attendanceLocation: SITE });
    expect(self.status).toBe(200);
    expect((await Employee.findById(emp.employee._id).lean()).attendanceLocation).toBeUndefined();
    expect((await request(app).patch(`/api/employees/${emp.employee._id}`).set(auth(emp.token)).send({ attendanceLocation: SITE })).status).toBe(403);
  });
});

describe('API responses are never cached', () => {
  test('attendance status is sent with Cache-Control: no-store', async () => {
    const emp = await setup('office@zorx.test');
    const res = await request(app).get('/api/attendance/me/today').set(auth(emp.token));
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
