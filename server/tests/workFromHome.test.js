import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { Attendance } from '../src/models/Attendance.js';
import { LeaveBalance } from '../src/models/LeaveBalance.js';
import { Notification } from '../src/models/Notification.js';
import { WorkFromHome } from '../src/models/WorkFromHome.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { getStartOfDayUTC } from '../src/utils/dateUtils.js';
import { ROLES, WFH_STATUS, ATTENDANCE_MODE, ATTENDANCE_STATUS } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';
const INSIDE_RADIUS_COORDS = { latitude: 10.991501, longitude: 76.442772 };
// ~120 km from the office — always outside the 200 m radius.
const HOME_COORDS = { latitude: 9.9312, longitude: 76.2673 };
const DAY_MS = 24 * 60 * 60 * 1000;

function dateInput(offsetDays = 0) {
  return new Date(getStartOfDayUTC().getTime() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

const validBody = (overrides = {}) => ({
  date: dateInput(0),
  reason: 'Personal work at home',
  workPlan: 'Complete assigned Content Calendar tasks and client work.',
  remark: 'Available during normal office hours.',
  ...overrides,
});

async function createUser(role, email) {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
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

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: DEV_PASSWORD });
  return res.body.data.token;
}

async function setupEmployee(email = 'emp@zorx.test') {
  const { user, employee } = await createUser(ROLES.EMPLOYEE, email);
  return { user, employee, token: await login(email) };
}

async function setupAdmin(email = 'admin@zorx.test') {
  const { user, employee } = await createUser(ROLES.ADMIN, email);
  return { user, employee, token: await login(email) };
}

function submitWfh(token, body = validBody()) {
  return request(app).post('/api/work-from-home').set('Authorization', `Bearer ${token}`).send(body);
}

async function approvedWfhFor(employeeId, offsetDays = 0) {
  return WorkFromHome.create({
    employeeId,
    date: new Date(getStartOfDayUTC().getTime() + offsetDays * DAY_MS),
    reason: 'Home',
    workPlan: 'Client work',
    status: WFH_STATUS.APPROVED,
  });
}

function checkIn(token, coords) {
  return request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${token}`).send(coords);
}

function checkOut(token, coords) {
  return request(app).post('/api/attendance/check-out').set('Authorization', `Bearer ${token}`).send(coords);
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

describe('WFH request creation', () => {
  test('an authenticated employee can create a WFH request for today', async () => {
    const { employee, token } = await setupEmployee();
    const res = await submitWfh(token);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe(WFH_STATUS.PENDING);
    expect(res.body.data.employeeId).toBe(employee._id.toString());
    expect(new Date(res.body.data.date).toISOString()).toBe(getStartOfDayUTC().toISOString());
  });

  test('an employeeId sent by the client is ignored — the request belongs to the caller', async () => {
    const { employee, token } = await setupEmployee();
    const { employee: victim } = await createUser(ROLES.EMPLOYEE, 'victim@zorx.test');

    const res = await submitWfh(token, { ...validBody(), employeeId: victim._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.employeeId).toBe(employee._id.toString());
    expect(await WorkFromHome.countDocuments({ employeeId: victim._id })).toBe(0);
  });

  test.each(['date', 'reason', 'workPlan'])('rejects a request missing the required %s field', async (field) => {
    const { token } = await setupEmployee();
    const body = validBody();
    delete body[field];
    const res = await submitWfh(token, body);
    expect(res.status).toBe(400);
    expect(await WorkFromHome.countDocuments({})).toBe(0);
  });

  test('remark is optional', async () => {
    const { token } = await setupEmployee();
    const body = validBody();
    delete body.remark;
    const res = await submitWfh(token, body);
    expect(res.status).toBe(201);
    expect(res.body.data.remark).toBe('');
  });

  test('rejects a past date', async () => {
    const { token } = await setupEmployee();
    const res = await submitWfh(token, validBody({ date: dateInput(-1) }));
    expect(res.status).toBe(400);
    expect(await WorkFromHome.countDocuments({})).toBe(0);
  });

  test('rejects an impossible calendar date', async () => {
    const { token } = await setupEmployee();
    const res = await submitWfh(token, validBody({ date: '2026-02-30' }));
    expect(res.status).toBe(400);
  });

  test('rejects a duplicate active request for the same date', async () => {
    const { token } = await setupEmployee();
    expect((await submitWfh(token)).status).toBe(201);

    const duplicate = await submitWfh(token);
    expect(duplicate.status).toBe(409);
    expect(await WorkFromHome.countDocuments({})).toBe(1);
  });

  test('a new request is allowed for a date whose earlier request was rejected, without deleting the old one', async () => {
    const { token } = await setupEmployee();
    const admin = await setupAdmin();
    const first = await submitWfh(token);
    await request(app)
      .patch(`/api/work-from-home/${first.body.data._id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    const second = await submitWfh(token);
    expect(second.status).toBe(201);
    expect(await WorkFromHome.countDocuments({})).toBe(2);
  });

  test('requires authentication', async () => {
    const res = await request(app).post('/api/work-from-home').send(validBody());
    expect(res.status).toBe(401);
  });
});

describe('WFH employee security', () => {
  test('an employee sees only their own requests', async () => {
    const a = await setupEmployee('a@zorx.test');
    const b = await setupEmployee('b@zorx.test');
    await submitWfh(a.token);
    await submitWfh(b.token, validBody({ date: dateInput(1) }));

    const res = await request(app).get('/api/work-from-home/my').set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].employeeId).toBe(a.employee._id.toString());
  });

  test("an employee cannot fetch another employee's request by id, but can fetch their own", async () => {
    const a = await setupEmployee('a@zorx.test');
    const b = await setupEmployee('b@zorx.test');
    const bRequest = await submitWfh(b.token);
    const aRequest = await submitWfh(a.token);

    const other = await request(app).get(`/api/work-from-home/${bRequest.body.data._id}`).set('Authorization', `Bearer ${a.token}`);
    expect(other.status).toBe(403);

    const own = await request(app).get(`/api/work-from-home/${aRequest.body.data._id}`).set('Authorization', `Bearer ${a.token}`);
    expect(own.status).toBe(200);
  });

  test('an employee cannot list all requests or read the summary', async () => {
    const { token } = await setupEmployee();
    expect((await request(app).get('/api/work-from-home').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get('/api/work-from-home/summary').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  test('an employee cannot approve or reject — not even their own request', async () => {
    const { token } = await setupEmployee();
    const created = await submitWfh(token);
    const id = created.body.data._id;

    const approve = await request(app).patch(`/api/work-from-home/${id}/approve`).set('Authorization', `Bearer ${token}`).send({});
    const reject = await request(app).patch(`/api/work-from-home/${id}/reject`).set('Authorization', `Bearer ${token}`).send({});

    expect(approve.status).toBe(403);
    expect(reject.status).toBe(403);
    expect((await WorkFromHome.findById(id)).status).toBe(WFH_STATUS.PENDING);
  });

  test('an employee has no way to set a request status directly', async () => {
    const { token } = await setupEmployee();
    const created = await submitWfh(token);
    const id = created.body.data._id;

    const res = await request(app)
      .patch(`/api/work-from-home/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: WFH_STATUS.APPROVED });

    expect(res.status).toBe(404);
    expect((await WorkFromHome.findById(id)).status).toBe(WFH_STATUS.PENDING);
  });

  test('a status sent at creation is ignored', async () => {
    const { token } = await setupEmployee();
    const res = await submitWfh(token, { ...validBody(), status: WFH_STATUS.APPROVED });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe(WFH_STATUS.PENDING);
  });
});

describe('WFH management (admin)', () => {
  test('an admin can list requests and read the summary', async () => {
    const emp = await setupEmployee();
    const admin = await setupAdmin();
    await submitWfh(emp.token);
    await submitWfh(emp.token, validBody({ date: dateInput(1) }));

    const list = await request(app).get('/api/work-from-home').set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data[0].employeeId.firstName).toBe(ROLES.EMPLOYEE);

    const pendingOnly = await request(app).get('/api/work-from-home?status=PENDING').set('Authorization', `Bearer ${admin.token}`);
    expect(pendingOnly.body.meta.total).toBe(2);

    const summary = await request(app).get('/api/work-from-home/summary').set('Authorization', `Bearer ${admin.token}`);
    expect(summary.body.data).toEqual({ pending: 2, approved: 0, rejected: 0, today: 0 });
  });

  test('an invalid status filter is rejected rather than passed to the query', async () => {
    const admin = await setupAdmin();
    const res = await request(app).get('/api/work-from-home?status[$ne]=PENDING').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  test('an admin can approve, which notifies the employee and records an audit entry', async () => {
    const emp = await setupEmployee();
    const admin = await setupAdmin();
    const created = await submitWfh(emp.token);

    const res = await request(app)
      .patch(`/api/work-from-home/${created.body.data._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(WFH_STATUS.APPROVED);
    const saved = await WorkFromHome.findById(created.body.data._id);
    expect(saved.reviewedBy.toString()).toBe(admin.user._id.toString());
    expect(saved.reviewedAt).toBeTruthy();
    expect(await Notification.countDocuments({ userId: emp.user._id, type: 'WFH_APPROVED' })).toBe(1);

    const summary = await request(app).get('/api/work-from-home/summary').set('Authorization', `Bearer ${admin.token}`);
    expect(summary.body.data).toEqual({ pending: 0, approved: 1, rejected: 0, today: 1 });
  });

  test('an admin can reject with a review note', async () => {
    const emp = await setupEmployee();
    const admin = await setupAdmin();
    const created = await submitWfh(emp.token);

    const res = await request(app)
      .patch(`/api/work-from-home/${created.body.data._id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reviewNote: 'Please coordinate with the team before taking WFH.' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(WFH_STATUS.REJECTED);
    expect(res.body.data.reviewNote).toBe('Please coordinate with the team before taking WFH.');

    const mine = await request(app).get('/api/work-from-home/my').set('Authorization', `Bearer ${emp.token}`);
    expect(mine.body.data[0].reviewNote).toBe('Please coordinate with the team before taking WFH.');
  });

  test('a request cannot be reviewed twice', async () => {
    const emp = await setupEmployee();
    const admin = await setupAdmin();
    const created = await submitWfh(emp.token);
    const id = created.body.data._id;

    await request(app).patch(`/api/work-from-home/${id}/approve`).set('Authorization', `Bearer ${admin.token}`).send({});
    const again = await request(app).patch(`/api/work-from-home/${id}/reject`).set('Authorization', `Bearer ${admin.token}`).send({});

    expect(again.status).toBe(400);
    expect((await WorkFromHome.findById(id)).status).toBe(WFH_STATUS.APPROVED);
  });

  test('an admin cannot review their own WFH request', async () => {
    const admin = await setupAdmin();
    const created = await submitWfh(admin.token);

    const res = await request(app)
      .patch(`/api/work-from-home/${created.body.data._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    expect(res.status).toBe(403);
    expect((await WorkFromHome.findById(created.body.data._id)).status).toBe(WFH_STATUS.PENDING);
  });

  test('a malformed id returns 404, not a server error', async () => {
    const admin = await setupAdmin();
    const res = await request(app).patch('/api/work-from-home/not-an-id/approve').set('Authorization', `Bearer ${admin.token}`).send({});
    expect(res.status).toBe(404);
  });
});

describe('WFH attendance integration', () => {
  test('without any WFH, check-in from outside the office radius is still rejected', async () => {
    const { token } = await setupEmployee();
    const res = await checkIn(token, HOME_COORDS);
    expect(res.status).toBe(403);
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('a PENDING WFH request does not bypass location validation', async () => {
    const { token } = await setupEmployee();
    await submitWfh(token);
    const res = await checkIn(token, HOME_COORDS);
    expect(res.status).toBe(403);
  });

  test('a REJECTED WFH request does not bypass location validation', async () => {
    const emp = await setupEmployee();
    const admin = await setupAdmin();
    const created = await submitWfh(emp.token);
    await request(app)
      .patch(`/api/work-from-home/${created.body.data._id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    expect((await checkIn(emp.token, HOME_COORDS)).status).toBe(403);
  });

  test('an approved WFH for a different day does not bypass location validation today', async () => {
    const { employee, token } = await setupEmployee();
    await approvedWfhFor(employee._id, 1);
    expect((await checkIn(token, HOME_COORDS)).status).toBe(403);
  });

  test("another employee's approved WFH does not bypass this employee's location validation", async () => {
    const other = await setupEmployee('other@zorx.test');
    const me = await setupEmployee('me@zorx.test');
    await approvedWfhFor(other.employee._id, 0);
    expect((await checkIn(me.token, HOME_COORDS)).status).toBe(403);
  });

  test('approved WFH today: check-in and check-out succeed away from the office and are marked WFH', async () => {
    const { employee, token } = await setupEmployee();
    await approvedWfhFor(employee._id, 0);

    const inRes = await checkIn(token, HOME_COORDS);
    expect(inRes.status).toBe(200);
    expect(inRes.body.data.attendanceMode).toBe(ATTENDANCE_MODE.WFH);
    expect([ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE]).toContain(inRes.body.data.status);
    expect(inRes.body.data.checkIn.distanceFromOffice).toBeGreaterThan(200);

    const outRes = await checkOut(token, HOME_COORDS);
    expect(outRes.status).toBe(200);
    expect(outRes.body.data.checkOut).toBeTruthy();
    expect(outRes.body.data.attendanceMode).toBe(ATTENDANCE_MODE.WFH);
  });

  test('approved WFH still requires valid coordinates', async () => {
    const { employee, token } = await setupEmployee();
    await approvedWfhFor(employee._id, 0);
    expect((await checkIn(token, { latitude: 999, longitude: 999 })).status).toBe(400);
  });

  test('approved WFH keeps the existing duplicate check-in rule', async () => {
    const { employee, token } = await setupEmployee();
    await approvedWfhFor(employee._id, 0);
    expect((await checkIn(token, HOME_COORDS)).status).toBe(200);
    expect((await checkIn(token, HOME_COORDS)).status).toBe(409);
  });

  test('a normal in-office check-in is unchanged and recorded as OFFICE', async () => {
    const { token } = await setupEmployee();
    const res = await checkIn(token, INSIDE_RADIUS_COORDS);
    expect(res.status).toBe(200);
    expect(res.body.data.attendanceMode).toBe(ATTENDANCE_MODE.OFFICE);
  });

  test('WFH never touches leave balances', async () => {
    const emp = await setupEmployee();
    const admin = await setupAdmin();
    const created = await submitWfh(emp.token);
    await request(app)
      .patch(`/api/work-from-home/${created.body.data._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    await checkIn(emp.token, HOME_COORDS);

    expect(await LeaveBalance.countDocuments({})).toBe(0);
  });

  test('legacy attendance records without attendanceMode stay valid and count as OFFICE in the admin filter', async () => {
    const { employee } = await setupEmployee();
    const admin = await setupAdmin();
    const legacy = await Attendance.collection.insertOne({
      employeeId: employee._id,
      date: getStartOfDayUTC(new Date(Date.now() - 2 * DAY_MS)),
      checkIn: null,
      checkOut: null,
      breaks: [],
      status: ATTENDANCE_STATUS.PRESENT,
    });

    const officeRes = await request(app).get('/api/attendance?mode=OFFICE').set('Authorization', `Bearer ${admin.token}`);
    const wfhRes = await request(app).get('/api/attendance?mode=WFH').set('Authorization', `Bearer ${admin.token}`);
    const allRes = await request(app).get('/api/attendance').set('Authorization', `Bearer ${admin.token}`);

    expect(officeRes.body.data.map((r) => r._id)).toContain(legacy.insertedId.toString());
    expect(wfhRes.body.data.map((r) => r._id)).not.toContain(legacy.insertedId.toString());
    expect(allRes.body.data.map((r) => r._id)).toContain(legacy.insertedId.toString());

    const raw = await Attendance.collection.findOne({ _id: legacy.insertedId });
    expect(raw).not.toHaveProperty('attendanceMode');
  });

  test('the admin mode filter returns only WFH records when asked', async () => {
    const wfhEmp = await setupEmployee('wfh@zorx.test');
    const officeEmp = await setupEmployee('office@zorx.test');
    const admin = await setupAdmin();
    await approvedWfhFor(wfhEmp.employee._id, 0);
    await checkIn(wfhEmp.token, HOME_COORDS);
    await checkIn(officeEmp.token, INSIDE_RADIUS_COORDS);

    const wfhRes = await request(app).get('/api/attendance?mode=WFH').set('Authorization', `Bearer ${admin.token}`);
    expect(wfhRes.body.data).toHaveLength(1);
    expect(wfhRes.body.data[0].employeeId._id).toBe(wfhEmp.employee._id.toString());
  });

  test('GET /my/today reports approved WFH for today only', async () => {
    const { employee, token } = await setupEmployee();
    const before = await request(app).get('/api/work-from-home/my/today').set('Authorization', `Bearer ${token}`);
    expect(before.body.data.approved).toBe(false);

    await approvedWfhFor(employee._id, 0);
    const after = await request(app).get('/api/work-from-home/my/today').set('Authorization', `Bearer ${token}`);
    expect(after.body.data.approved).toBe(true);
  });
});
