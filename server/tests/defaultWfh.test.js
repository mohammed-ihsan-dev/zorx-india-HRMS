import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { Attendance } from '../src/models/Attendance.js';
import { WorkFromHome } from '../src/models/WorkFromHome.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { minutesSinceMidnight } from '../src/utils/dateUtils.js';
import { ROLES, WORK_MODE, ATTENDANCE_MODE, ATTENDANCE_STATUS, WFH_STATUS } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';
const INSIDE_RADIUS_COORDS = { latitude: 10.991501, longitude: 76.442772 };
const HOME_COORDS = { latitude: 9.9312, longitude: 76.2673 };
// Exactly what the Punch Station sends for a permanent-WFH employee: no location.
const NO_LOCATION = {};

function hhmm(totalMinutes) {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

async function setOfficeStart(workingStartTime) {
  await OfficeSettings.updateOne({}, { $set: { workingStartTime } });
}

async function createUser(role, email, workMode) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(DEV_PASSWORD), role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`,
    firstName: role,
    lastName: 'Test',
    joiningDate: new Date('2025-01-01'),
    ...(workMode ? { workMode } : {}),
  });
  user.employeeId = employee._id;
  await user.save();
  return { user, employee };
}

async function login(email, password = DEV_PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}

async function setup(role, email, workMode) {
  const { user, employee } = await createUser(role, email, workMode);
  const res = await login(email);
  return { user, employee, token: res.body.data.token };
}

const defaultWfh = () => setup(ROLES.EMPLOYEE, 'remote@zorx.test', WORK_MODE.WFH);
const officeEmployee = () => setup(ROLES.EMPLOYEE, 'office@zorx.test');

const post = (path, token, body = {}) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
const checkIn = (token, body) => post('/api/attendance/check-in', token, body);
const checkOut = (token, body) => post('/api/attendance/check-out', token, body);

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

describe('default WFH employee — attendance', () => {
  test('authenticates normally', async () => {
    await createUser(ROLES.EMPLOYEE, 'remote@zorx.test', WORK_MODE.WFH);
    const res = await login('remote@zorx.test');
    expect(res.status).toBe(200);
    expect(res.body.data.user.employee.workMode).toBe(WORK_MODE.WFH);
  });

  test('checks in and out with no coordinates at all, saved as a normal WFH attendance record with null location', async () => {
    const { employee, token } = await defaultWfh();

    const inRes = await checkIn(token, NO_LOCATION);
    expect(inRes.status).toBe(200);
    expect(inRes.body.data.attendanceMode).toBe(ATTENDANCE_MODE.WFH);
    expect(inRes.body.data.checkIn).toMatchObject({ latitude: null, longitude: null, distanceFromOffice: null });

    const outRes = await checkOut(token, NO_LOCATION);
    expect(outRes.status).toBe(200);
    expect(outRes.body.data.checkOut).toMatchObject({ latitude: null, longitude: null, distanceFromOffice: null });

    const saved = await Attendance.findOne({ employeeId: employee._id });
    expect(saved.attendanceMode).toBe(ATTENDANCE_MODE.WFH);
    expect(saved.checkIn.timestamp).toBeTruthy();
    expect(saved.checkOut.timestamp).toBeTruthy();
    expect(await Attendance.countDocuments({})).toBe(1);
    expect(await WorkFromHome.countDocuments({})).toBe(0);
  });

  test('coordinates sent anyway are ignored, never stored, and never radius-checked', async () => {
    const { employee, token } = await defaultWfh();
    const res = await checkIn(token, { ...HOME_COORDS });
    expect(res.status).toBe(200);
    const saved = await Attendance.findOne({ employeeId: employee._id }).lean();
    expect(saved.checkIn).toMatchObject({ latitude: null, longitude: null, distanceFromOffice: null });

    const malformed = await checkOut(token, { latitude: 'abc', longitude: 999 });
    expect(malformed.status).toBe(200);
  });

  test('duplicate check-in and duplicate check-out are still prevented', async () => {
    const { token } = await defaultWfh();
    expect((await checkIn(token, NO_LOCATION)).status).toBe(200);
    expect((await checkIn(token, NO_LOCATION)).status).toBe(409);
    expect((await checkOut(token, NO_LOCATION)).status).toBe(200);
    expect((await checkOut(token, NO_LOCATION)).status).toBe(409);
  });

  test('cannot check out before checking in', async () => {
    const { token } = await defaultWfh();
    expect((await checkOut(token, NO_LOCATION)).status).toBe(400);
  });

  test('requires authentication', async () => {
    expect((await request(app).post('/api/attendance/check-in').send({})).status).toBe(401);
  });

  test('late calculation still applies', async () => {
    const { token } = await defaultWfh();
    await setOfficeStart(hhmm(minutesSinceMidnight() - 60));
    const res = await checkIn(token, NO_LOCATION);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(ATTENDANCE_STATUS.LATE);
    expect(res.body.data.lateMinutes).toBeGreaterThan(0);
  });

  test('an on-time check-in is not marked late', async () => {
    const { token } = await defaultWfh();
    await setOfficeStart(hhmm(minutesSinceMidnight() + 60));
    const res = await checkIn(token, NO_LOCATION);
    expect(res.body.data.status).toBe(ATTENDANCE_STATUS.PRESENT);
    expect(res.body.data.lateMinutes).toBe(0);
  });

  test('half-day calculation still applies', async () => {
    const { employee, token } = await defaultWfh();
    await setOfficeStart(hhmm(minutesSinceMidnight() + 60));
    await checkIn(token, NO_LOCATION);
    await Attendance.updateOne(
      { employeeId: employee._id },
      { $set: { 'checkIn.timestamp': new Date(Date.now() - 60 * 60 * 1000) } }
    );

    const res = await checkOut(token, NO_LOCATION);
    expect(res.status).toBe(200);
    expect(res.body.data.totalWorkingMinutes).toBeGreaterThanOrEqual(59);
    expect(res.body.data.status).toBe(ATTENDANCE_STATUS.HALF_DAY);
  });

  test('break rules still apply — cannot check out during an active break', async () => {
    const { token } = await defaultWfh();
    await checkIn(token, NO_LOCATION);
    expect((await post('/api/attendance/break/start', token, { type: 'TEA' })).status).toBe(200);
    expect((await checkOut(token, NO_LOCATION)).status).toBe(400);
  });

  test('appears in admin attendance under All and under the WFH filter, not under Office', async () => {
    const remote = await defaultWfh();
    const office = await officeEmployee();
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    await checkIn(remote.token, NO_LOCATION);
    await checkIn(office.token, INSIDE_RADIUS_COORDS);

    const list = async (q = '') =>
      (await request(app).get(`/api/attendance${q}`).set('Authorization', `Bearer ${admin.token}`)).body.data.map((r) => r.employeeId._id);
    const remoteId = remote.employee._id.toString();
    const officeId = office.employee._id.toString();

    expect(await list()).toEqual(expect.arrayContaining([remoteId, officeId]));
    expect(await list('?mode=WFH')).toEqual([remoteId]);
    expect(await list('?mode=OFFICE')).toEqual([officeId]);
  });

  test('super admin also sees the WFH record', async () => {
    const remote = await defaultWfh();
    const superAdmin = await setup(ROLES.SUPER_ADMIN, 'super@zorx.test');
    await checkIn(remote.token, NO_LOCATION);
    const res = await request(app).get('/api/attendance?mode=WFH').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('a WFH check-in counts as attended (Present/Late) on the admin dashboard, never Absent', async () => {
    const remote = await defaultWfh();
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    await setOfficeStart(hhmm(minutesSinceMidnight() + 60));
    await checkIn(remote.token, NO_LOCATION);

    const d = (await request(app).get('/api/dashboard/admin').set('Authorization', `Bearer ${admin.token}`)).body.data;
    expect(d.totalEmployees).toBe(2);
    expect(d.present).toBe(1);
    expect(d.absent).toBe(1); // the admin, who hasn't checked in
  });
});

describe('default WFH employee — WFH request workflow', () => {
  test('/my/today reports default WFH', async () => {
    const { token } = await defaultWfh();
    const res = await request(app).get('/api/work-from-home/my/today').set('Authorization', `Bearer ${token}`);
    expect(res.body.data).toMatchObject({ approved: true, defaultWfh: true });
  });

  test('submitting a WFH request is refused because none is needed', async () => {
    const { token } = await defaultWfh();
    const res = await post('/api/work-from-home', token, { date: new Date().toISOString().slice(0, 10), reason: 'x'.repeat(5), workPlan: 'y'.repeat(5) });
    expect(res.status).toBe(400);
    expect(await WorkFromHome.countDocuments({})).toBe(0);
  });
});

describe('normal office employee — unchanged', () => {
  test('still requires the office radius', async () => {
    const { token } = await officeEmployee();
    expect((await checkIn(token, HOME_COORDS)).status).toBe(403);
    expect((await checkIn(token, INSIDE_RADIUS_COORDS)).status).toBe(200);
  });

  test('cannot bypass validation by sending attendanceMode or workMode in the payload', async () => {
    const { employee, token } = await officeEmployee();
    const res = await checkIn(token, { ...HOME_COORDS, attendanceMode: 'WFH', workMode: 'WFH', isWfh: true });
    expect(res.status).toBe(403);

    const inside = await checkIn(token, { ...INSIDE_RADIUS_COORDS, attendanceMode: 'WFH' });
    expect(inside.status).toBe(200);
    expect(inside.body.data.attendanceMode).toBe(ATTENDANCE_MODE.OFFICE);
    expect((await Employee.findById(employee._id)).workMode).toBe(WORK_MODE.OFFICE);
  });

  test('still requires coordinates — the exact existing validation error, unchanged', async () => {
    const { token } = await officeEmployee();
    const res = await checkIn(token, NO_LOCATION);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid request data.');
    expect(res.body.details.fieldErrors).toHaveProperty('latitude');
    expect((await checkIn(token, { latitude: 999, longitude: 999 })).status).toBe(400);
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('cannot skip coordinates by claiming WFH in the payload', async () => {
    const { token } = await officeEmployee();
    for (const claim of [{ attendanceMode: 'WFH' }, { workMode: 'WFH' }, { attendanceMode: 'WFH', workMode: 'WFH', defaultWfh: true }]) {
      const res = await checkIn(token, claim);
      expect(res.status).toBe(400);
    }
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('in-office attendance still records real coordinates', async () => {
    const { token } = await officeEmployee();
    const res = await checkIn(token, INSIDE_RADIUS_COORDS);
    expect(res.body.data.checkIn.latitude).toBe(INSIDE_RADIUS_COORDS.latitude);
    expect(res.body.data.checkIn.distanceFromOffice).toBeGreaterThanOrEqual(0);
    expect(res.body.data.attendanceMode).toBe(ATTENDANCE_MODE.OFFICE);
  });

  test('legacy attendance records with stored coordinates still load unchanged', async () => {
    const { employee } = await officeEmployee();
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    const punch = { timestamp: new Date(Date.now() - 2 * 86400000), latitude: 10.99, longitude: 76.44, distanceFromOffice: 12 };
    await Attendance.collection.insertOne({ employeeId: employee._id, date: new Date(Date.now() - 2 * 86400000), checkIn: punch, checkOut: null, breaks: [], status: 'PRESENT' });

    const res = await request(app).get('/api/attendance').set('Authorization', `Bearer ${admin.token}`);
    expect(res.body.data[0].checkIn).toMatchObject({ latitude: 10.99, longitude: 76.44, distanceFromOffice: 12 });
  });

  test('cannot make themselves WFH through their own profile update', async () => {
    const { employee, token } = await officeEmployee();
    const res = await request(app)
      .patch('/api/employees/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ address: 'Home', workMode: 'WFH' });
    expect(res.status).toBe(200);
    expect((await Employee.findById(employee._id)).workMode).toBe(WORK_MODE.OFFICE);
  });

  test('cannot change work mode through the admin employee API', async () => {
    const { employee, token } = await officeEmployee();
    const res = await request(app)
      .patch(`/api/employees/${employee._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workMode: 'WFH' });
    expect(res.status).toBe(403);
  });

  test('an employee record predating workMode is treated as OFFICE', async () => {
    const { employee, token } = await officeEmployee();
    await Employee.collection.updateOne({ _id: employee._id }, { $unset: { workMode: '' } });
    expect((await Employee.collection.findOne({ _id: employee._id })).workMode).toBeUndefined();
    expect((await checkIn(token, HOME_COORDS)).status).toBe(403);
  });
});

describe('admin work-mode management', () => {
  test('an admin can create a default WFH employee and switch them back to OFFICE', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    const created = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ email: 'new@zorx.test', password: 'Password1', firstName: 'New', joiningDate: '2026-01-01', workMode: 'WFH' });
    expect(created.status).toBe(201);
    expect(created.body.data.workMode).toBe(WORK_MODE.WFH);

    const token = (await login('new@zorx.test', 'Password1')).body.data.token;
    expect((await checkIn(token, HOME_COORDS)).status).toBe(200);

    const switched = await request(app)
      .patch(`/api/employees/${created.body.data._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ workMode: 'OFFICE' });
    expect(switched.body.data.workMode).toBe(WORK_MODE.OFFICE);
  });

  test('employees created without a work mode default to OFFICE', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    const created = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ email: 'plain@zorx.test', password: 'Password1', firstName: 'Plain', joiningDate: '2026-01-01' });
    expect(created.body.data.workMode).toBe(WORK_MODE.OFFICE);
  });
});

describe('temporary approved WFH — unchanged, through the same decision', () => {
  test('request -> admin approval -> location bypass for that date only for that employee', async () => {
    const emp = await officeEmployee();
    const other = await setup(ROLES.EMPLOYEE, 'other@zorx.test');
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const created = await post('/api/work-from-home', emp.token, { date: today, reason: 'Home work', workPlan: 'Client tasks' });
    expect(created.status).toBe(201);
    expect((await checkIn(emp.token, HOME_COORDS)).status).toBe(403);

    await request(app).patch(`/api/work-from-home/${created.body.data._id}/approve`).set('Authorization', `Bearer ${admin.token}`).send({});
    expect((await WorkFromHome.findById(created.body.data._id)).status).toBe(WFH_STATUS.APPROVED);

    // Temporary WFH keeps its existing behavior: coordinates are still required
    // and recorded; only the radius is skipped.
    expect((await checkIn(emp.token, NO_LOCATION)).status).toBe(400);

    const res = await checkIn(emp.token, HOME_COORDS);
    expect(res.status).toBe(200);
    expect(res.body.data.attendanceMode).toBe(ATTENDANCE_MODE.WFH);
    expect(res.body.data.checkIn.latitude).toBe(HOME_COORDS.latitude);
    expect(res.body.data.checkIn.distanceFromOffice).toBeGreaterThan(200);
    expect((await checkIn(other.token, HOME_COORDS)).status).toBe(403);
  });

  test('admin WFH management still lists and reviews requests', async () => {
    const emp = await officeEmployee();
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const created = await post('/api/work-from-home', emp.token, { date: today, reason: 'Home work', workPlan: 'Client tasks' });

    const list = await request(app).get('/api/work-from-home').set('Authorization', `Bearer ${admin.token}`);
    expect(list.body.meta.total).toBe(1);
    const rejected = await request(app)
      .patch(`/api/work-from-home/${created.body.data._id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reviewNote: 'Not today' });
    expect(rejected.body.data.status).toBe(WFH_STATUS.REJECTED);
    expect((await checkIn(emp.token, HOME_COORDS)).status).toBe(403);
  });
});

describe('configureDefaultWfhEmployees seed script', () => {
  function runScript(env = {}) {
    const { host, port, name } = mongoose.connection;
    const result = spawnSync('node', ['src/seed/configureDefaultWfhEmployees.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, MONGODB_URI: `mongodb://${host}:${port}/`, MONGODB_DB: name, ...env },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    return `${result.stdout}${result.stderr}`;
  }

  test('creates the account once with a hashed password, and is idempotent on re-run', async () => {
    const first = runScript({ DEFAULT_WFH_INITIAL_PASSWORD: 'Initial@123' });
    expect(first).toContain('CREATED');
    expect(first).not.toContain('Initial@123');

    const user = await User.findOne({ email: 'aysha@zorxmedia.com' }).select('+passwordHash');
    expect(user.passwordHash).not.toBe('Initial@123');
    expect(await user.comparePassword('Initial@123')).toBe(true);
    expect((await Employee.findById(user.employeeId)).workMode).toBe(WORK_MODE.WFH);

    const second = runScript({ DEFAULT_WFH_INITIAL_PASSWORD: 'Different@456' });
    expect(second).toContain('OK');
    expect(await User.countDocuments({ email: 'aysha@zorxmedia.com' })).toBe(1);
    const again = await User.findById(user._id).select('+passwordHash');
    expect(await again.comparePassword('Initial@123')).toBe(true);

    const login1 = await login('aysha@zorxmedia.com', 'Initial@123');
    expect(login1.status).toBe(200);
  });

  test('an existing account only gets workMode updated — password and profile untouched', async () => {
    const { user, employee } = await createUser(ROLES.EMPLOYEE, 'aysha@zorxmedia.com');
    const before = await User.findById(user._id).select('+passwordHash');

    const out = runScript({ DEFAULT_WFH_INITIAL_PASSWORD: 'Ignored@123' });
    expect(out).toContain('UPDATED');

    const after = await User.findById(user._id).select('+passwordHash');
    expect(after.passwordHash).toBe(before.passwordHash);
    const emp = await Employee.findById(employee._id);
    expect(emp.workMode).toBe(WORK_MODE.WFH);
    expect(emp.firstName).toBe(ROLES.EMPLOYEE);
    expect(await User.countDocuments({})).toBe(1);
  });

  test('does not create an account without a password', async () => {
    const out = runScript({ DEFAULT_WFH_INITIAL_PASSWORD: '' });
    expect(out).toContain('SKIPPED');
    expect(await User.countDocuments({})).toBe(0);
  });
});
