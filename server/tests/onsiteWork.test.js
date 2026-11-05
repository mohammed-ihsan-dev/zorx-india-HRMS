import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { Notification } from '../src/models/Notification.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { OnsiteWorkRequest } from '../src/models/OnsiteWorkRequest.js';
import { ONSITE_WORK_EMPLOYEE_IDS } from '../src/config/onsiteWorkPolicies.js';
import { isOnsiteWorkEligible } from '../src/services/onsiteWorkService.js';
import { getEffectivePermissions } from '../src/utils/permissions.js';
import { getStartOfDayUTC } from '../src/utils/dateUtils.js';
import { ROLES, PERMISSIONS, WORK_MODE } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const RIFAN_ID = '6adf17303c9ddd5f303eef7a'; // the configured employee
const OFFICE = { latitude: 10.991401, longitude: 76.442772 };
const UAE_SITE = { name: 'Dubai Office', latitude: 25.189377, longitude: 55.256574, radiusMeters: 200, active: true };
const SHOOT = { latitude: 25.0657, longitude: 55.1713 }; // ~16 km from the UAE site
const metresNorth = (p, m) => ({ latitude: p.latitude + m / 111320, longitude: p.longitude });

const ymd = (d) => d.toISOString().slice(0, 10);
const TODAY = ymd(getStartOfDayUTC());
const plusDays = (n) => ymd(new Date(getStartOfDayUTC().getTime() + n * 86400000));

async function setup(email, role = ROLES.EMPLOYEE, extra = {}, employeeExtra = {}) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role, ...extra });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 7)}`,
    firstName: email.split('@')[0],
    lastName: 'T',
    joiningDate: new Date('2024-01-15'),
    ...employeeExtra,
  });
  user.employeeId = employee._id;
  await user.save();
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { user, employee, token: login.body.data.token, login: login.body.data.user };
}
const setupRifan = (extra = {}) => setup('rifan@zorx.test', ROLES.EMPLOYEE, {}, { _id: RIFAN_ID, firstName: 'MUHAMMED', lastName: 'RIFAN', attendanceLocation: UAE_SITE, ...extra });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const submit = (t, body) => request(app).post('/api/onsite-work').set(auth(t)).send(body);
const approve = (t, id, comment) => request(app).patch(`/api/onsite-work/${id}/approve`).set(auth(t)).send(comment ? { comment } : {});
const reject = (t, id, comment) => request(app).patch(`/api/onsite-work/${id}/reject`).set(auth(t)).send(comment === undefined ? {} : { comment });
const checkIn = (t, c) => request(app).post('/api/attendance/check-in').set(auth(t)).send(c);
const checkOut = (t, c) => request(app).post('/api/attendance/check-out').set(auth(t)).send(c);
const valid = (date = TODAY) => ({ date, reason: 'Videography', workLocation: 'Dubai Marina — client shoot', description: 'With the videographer' });

beforeAll(async () => {
  await startTestDb();
  await OnsiteWorkRequest.syncIndexes();
});
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  await OfficeSettings.create({ officeName: 'ZORX INDIA', ...OFFICE, attendanceRadius: 200, workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: 'Asia/Kolkata', lateThresholdMinutes: 1440, halfDayThresholdMinutes: 240, overtimeEnabled: true });
});

describe('configuration and permissions', () => {
  test('only Muhammed Rifan is enabled, by immutable employee id', () => {
    expect(ONSITE_WORK_EMPLOYEE_IDS).toEqual([RIFAN_ID]);
    expect(isOnsiteWorkEligible(RIFAN_ID)).toBe(true);
    expect(isOnsiteWorkEligible('64b000000000000000000000')).toBe(false);
    expect(isOnsiteWorkEligible(null)).toBe(false);
  });

  test('review permission: Super Admin by default; Admin and Employee only by explicit grant', () => {
    expect(getEffectivePermissions({ role: ROLES.SUPER_ADMIN, permissions: [] })).toContain(PERMISSIONS.ONSITE_WORK_REVIEW);
    expect(getEffectivePermissions({ role: ROLES.ADMIN, permissions: [] })).not.toContain(PERMISSIONS.ONSITE_WORK_REVIEW);
    expect(getEffectivePermissions({ role: ROLES.EMPLOYEE, permissions: [] })).not.toContain(PERMISSIONS.ONSITE_WORK_REVIEW);
    expect(getEffectivePermissions({ role: ROLES.ADMIN, permissions: [PERMISSIONS.ONSITE_WORK_REVIEW] })).toContain(PERMISSIONS.ONSITE_WORK_REVIEW);
  });

  test('login tells the client who sees the Onsite Work page', async () => {
    expect((await setupRifan()).login.onsiteWorkEligible).toBe(true);
    expect((await setup('other@zorx.test')).login.onsiteWorkEligible).toBe(false);
  });
});

describe('employee request workflow', () => {
  test('Rifan submits a request; it is pending and listed as his', async () => {
    const { token, employee } = await setupRifan();
    const res = await submit(token, valid(plusDays(2)));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PENDING', reason: 'Videography', workLocation: 'Dubai Marina — client shoot', employeeId: String(employee._id) });
    const mine = await request(app).get('/api/onsite-work/my').set(auth(token));
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].status).toBe('PENDING');
  });

  test('identity comes from the session: an employeeId in the body is refused', async () => {
    const { token } = await setupRifan();
    const other = await setup('other@zorx.test');
    const res = await submit(token, { ...valid(), employeeId: String(other.employee._id) });
    expect(res.status).toBe(400);
    expect(await OnsiteWorkRequest.countDocuments()).toBe(0);
  });

  test('required fields and dates are validated', async () => {
    const { token } = await setupRifan();
    expect((await submit(token, { ...valid(), date: '' })).status).toBe(400);
    expect((await submit(token, { ...valid(), date: '2026-02-30' })).status).toBe(400);
    expect((await submit(token, { ...valid(), reason: ' ' })).status).toBe(400);
    expect((await submit(token, { ...valid(), workLocation: '' })).status).toBe(400);
    const past = await submit(token, valid(plusDays(-1)));
    expect(past.status).toBe(400);
    expect(past.body.message).toMatch(/past date.*HR\/Admin/);
    expect((await submit(token, { date: plusDays(1), reason: 'Client Shoot', workLocation: 'JLT' })).status).toBe(201); // notes optional
  });

  test('duplicate active requests are blocked; a new one is allowed after cancel or rejection', async () => {
    const { token } = await setupRifan();
    const salman = await setup('salman@zorx.test', ROLES.SUPER_ADMIN);
    const first = await submit(token, valid(plusDays(3)));
    expect((await submit(token, valid(plusDays(3)))).status).toBe(409);
    expect((await request(app).patch(`/api/onsite-work/my/${first.body.data._id}/cancel`).set(auth(token))).status).toBe(200);
    const second = await submit(token, valid(plusDays(3)));
    expect(second.status).toBe(201);
    expect((await reject(salman.token, second.body.data._id, 'Shoot moved to next week')).status).toBe(200);
    const third = await submit(token, valid(plusDays(3)));
    expect(third.status).toBe(201);
    expect((await approve(salman.token, third.body.data._id)).status).toBe(200);
    expect((await submit(token, valid(plusDays(3)))).status).toBe(409); // approved blocks too
  });

  test('simultaneous duplicate submissions create only one active request (unique index)', async () => {
    const { token } = await setupRifan();
    const results = await Promise.all([submit(token, valid(plusDays(4))), submit(token, valid(plusDays(4)))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await OnsiteWorkRequest.countDocuments({ active: true })).toBe(1);
  });

  test('pending requests can be edited and cancelled; reviewed ones cannot', async () => {
    const { token } = await setupRifan();
    const salman = await setup('salman@zorx.test', ROLES.SUPER_ADMIN);
    const created = (await submit(token, valid(plusDays(2)))).body.data;
    const edited = await request(app).patch(`/api/onsite-work/my/${created._id}`).set(auth(token)).send({ workLocation: 'Al Quoz studio' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.workLocation).toBe('Al Quoz studio');
    await approve(salman.token, created._id);
    expect((await request(app).patch(`/api/onsite-work/my/${created._id}`).set(auth(token)).send({ workLocation: 'X Y' })).status).toBe(400);
    expect((await request(app).patch(`/api/onsite-work/my/${created._id}/cancel`).set(auth(token))).status).toBe(400);
    expect((await OnsiteWorkRequest.findById(created._id)).status).toBe('APPROVED');
  });

  test('other employees cannot use the feature or touch Rifan’s requests', async () => {
    const rifan = await setupRifan();
    const other = await setup('other@zorx.test');
    expect((await submit(other.token, valid())).status).toBe(403);
    expect((await request(app).get('/api/onsite-work/my').set(auth(other.token))).status).toBe(403);
    const created = (await submit(rifan.token, valid(plusDays(2)))).body.data;
    expect((await request(app).get(`/api/onsite-work/${created._id}`).set(auth(other.token))).status).toBe(403);
    expect((await request(app).get('/api/onsite-work').set(auth(other.token))).status).toBe(403);
  });
});

describe('review: Salman / Super Admins only', () => {
  test('Salman (Super Admin) approves; reviewer details, history, audit and notification are recorded', async () => {
    const rifan = await setupRifan();
    const salman = await setup('salman@zorx.test', ROLES.SUPER_ADMIN, {}, { firstName: 'Salman', lastName: '' });
    const created = (await submit(rifan.token, valid(plusDays(1)))).body.data;
    expect(await Notification.countDocuments({ userId: salman.user._id, type: 'ONSITE_SUBMITTED' })).toBe(1);

    const res = await approve(salman.token, created._id, 'Go ahead');
    expect(res.status).toBe(200);
    const saved = await OnsiteWorkRequest.findById(created._id).lean();
    expect(saved).toMatchObject({ status: 'APPROVED', active: true, reviewerName: 'Salman', reviewComment: 'Go ahead' });
    expect(String(saved.reviewedBy)).toBe(String(salman.user._id));
    expect(saved.reviewedAt).toBeInstanceOf(Date);
    expect(saved.history.map((h) => [h.action, h.fromStatus, h.toStatus])).toEqual([
      ['SUBMITTED', null, 'PENDING'],
      ['APPROVED', 'PENDING', 'APPROVED'],
    ]);
    const audit = await AuditLog.findOne({ action: 'ONSITE_REQUEST_APPROVED' }).lean();
    expect(audit.metadata).toMatchObject({ previousStatus: 'PENDING', newStatus: 'APPROVED', approverName: 'Salman' });
    expect(await Notification.countDocuments({ userId: rifan.user._id, type: 'ONSITE_APPROVED' })).toBe(1);
  });

  test('any Super Admin can review; all of them are notified of a new request', async () => {
    const rifan = await setupRifan();
    const sa1 = await setup('sa1@zorx.test', ROLES.SUPER_ADMIN);
    const sa2 = await setup('sa2@zorx.test', ROLES.SUPER_ADMIN);
    const admin = await setup('admin@zorx.test', ROLES.ADMIN);
    const created = (await submit(rifan.token, valid(plusDays(1)))).body.data;
    for (const u of [sa1, sa2]) expect(await Notification.countDocuments({ userId: u.user._id, type: 'ONSITE_SUBMITTED' })).toBe(1);
    expect(await Notification.countDocuments({ userId: admin.user._id })).toBe(0);
    expect((await reject(sa2.token, created._id, 'Not this week')).status).toBe(200);
    expect(await Notification.countDocuments({ userId: rifan.user._id, type: 'ONSITE_REJECTED' })).toBe(1);
  });

  test('ordinary Admin/HR and employees cannot list or review', async () => {
    const rifan = await setupRifan();
    const admin = await setup('admin@zorx.test', ROLES.ADMIN);
    const created = (await submit(rifan.token, valid(plusDays(1)))).body.data;
    for (const t of [admin.token, rifan.token]) {
      expect((await approve(t, created._id)).status).toBe(403);
      expect((await reject(t, created._id, 'no no no')).status).toBe(403);
      expect((await request(app).get('/api/onsite-work').set(auth(t))).status).toBe(403);
    }
    expect((await OnsiteWorkRequest.findById(created._id)).status).toBe('PENDING');
  });

  test('an Admin explicitly granted the permission can review', async () => {
    const rifan = await setupRifan();
    const hr = await setup('hr@zorx.test', ROLES.ADMIN, { permissions: [PERMISSIONS.ONSITE_WORK_REVIEW] });
    const created = (await submit(rifan.token, valid(plusDays(1)))).body.data;
    expect((await approve(hr.token, created._id)).status).toBe(200);
  });

  test('rejection requires a reason', async () => {
    const rifan = await setupRifan();
    const salman = await setup('salman@zorx.test', ROLES.SUPER_ADMIN);
    const created = (await submit(rifan.token, valid(plusDays(1)))).body.data;
    expect((await reject(salman.token, created._id)).status).toBe(400);
    expect((await reject(salman.token, created._id, '  ')).status).toBe(400);
    expect((await OnsiteWorkRequest.findById(created._id)).status).toBe('PENDING');
  });

  test('concurrent approvals: exactly one succeeds and Rifan gets one notification', async () => {
    const rifan = await setupRifan();
    const a = await setup('salman@zorx.test', ROLES.SUPER_ADMIN);
    const b = await setup('sa2@zorx.test', ROLES.SUPER_ADMIN);
    const created = (await submit(rifan.token, valid(plusDays(1)))).body.data;
    const results = await Promise.all([approve(a.token, created._id), approve(b.token, created._id), reject(b.token, created._id, 'conflicting')]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await Notification.countDocuments({ userId: rifan.user._id, type: { $in: ['ONSITE_APPROVED', 'ONSITE_REJECTED'] } })).toBe(1);
    expect((await approve(a.token, created._id)).status).toBe(409); // re-processing is refused
    expect(await Notification.countDocuments({ userId: rifan.user._id, type: { $in: ['ONSITE_APPROVED', 'ONSITE_REJECTED'] } })).toBe(1);
  });

  test('list supports status, employee and date filters with summary counts', async () => {
    const rifan = await setupRifan();
    const salman = await setup('salman@zorx.test', ROLES.SUPER_ADMIN);
    const r1 = (await submit(rifan.token, valid(plusDays(1)))).body.data;
    await submit(rifan.token, valid(plusDays(5)));
    await approve(salman.token, r1._id);
    const get = (q) => request(app).get(`/api/onsite-work${q}`).set(auth(salman.token));
    expect((await get('?status=PENDING')).body.data).toHaveLength(1);
    expect((await get(`?from=${plusDays(4)}`)).body.data).toHaveLength(1);
    expect((await get(`?employeeId=${RIFAN_ID}`)).body.data).toHaveLength(2);
    const all = await get('');
    expect(all.body.meta.summary).toMatchObject({ pending: 1, approved: 1, rejected: 0, cancelled: 0 });
    expect(all.body.data[0].employeeId.userId.email).toBe('rifan@zorx.test');
    expect((await get('?status=BOGUS')).status).toBe(400);
  });
});

describe('attendance integration', () => {
  async function approvedFor(date) {
    const rifan = await setupRifan();
    const salman = await setup('salman@zorx.test', ROLES.SUPER_ADMIN);
    const created = (await submit(rifan.token, valid(date))).body.data;
    expect((await approve(salman.token, created._id)).status).toBe(200);
    return { rifan, salman, created };
  }

  test('approved today: check-in and check-out outside the UAE site succeed with real GPS recorded', async () => {
    const { rifan } = await approvedFor(TODAY);
    const inRes = await checkIn(rifan.token, SHOOT);
    expect(inRes.status).toBe(200);
    expect(inRes.body.data).toMatchObject({ status: 'PRESENT', attendanceMode: 'ONSITE' });
    expect(inRes.body.data.checkIn).toMatchObject({ latitude: SHOOT.latitude, longitude: SHOOT.longitude });
    expect(inRes.body.data.checkIn.distanceFromOffice).toBeGreaterThan(10000); // distance from his UAE site, kept for the record
    const away = metresNorth(SHOOT, 900);
    const outRes = await checkOut(rifan.token, away);
    expect(outRes.status).toBe(200);
    expect(outRes.body.data.checkOut).toMatchObject({ latitude: away.latitude, longitude: away.longitude });
    expect(outRes.body.data.attendanceMode).toBe('ONSITE');
    expect(await Attendance.countDocuments()).toBe(1);
  });

  test('GPS is still required on an approved day', async () => {
    const { rifan } = await approvedFor(TODAY);
    expect((await checkIn(rifan.token, {})).status).toBe(400);
    expect((await checkIn(rifan.token, { latitude: 999, longitude: 0 })).status).toBe(400);
    expect(await Attendance.countDocuments()).toBe(0);
  });

  test('approval alone never creates attendance or marks Present', async () => {
    await approvedFor(TODAY);
    expect(await Attendance.countDocuments()).toBe(0);
  });

  test('existing duplicate check-in protection still applies', async () => {
    const { rifan } = await approvedFor(TODAY);
    expect((await checkIn(rifan.token, SHOOT)).status).toBe(200);
    expect((await checkIn(rifan.token, SHOOT)).status).toBe(409);
  });

  test('no request: Rifan must be inside his UAE site, exactly as before', async () => {
    const { token } = await setupRifan();
    const res = await checkIn(token, SHOOT);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/outside the Dubai Office attendance area/);
    const ok = await checkIn(token, metresNorth(UAE_SITE, 50));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ attendanceMode: 'OFFICE' });
    expect(ok.body.data.checkIn.distanceFromOffice).toBe(50);
  });

  test.each(['PENDING', 'REJECTED', 'CANCELLED'])('a %s request for today does not lift the geofence', async (status) => {
    const rifan = await setupRifan();
    const salman = await setup('salman@zorx.test', ROLES.SUPER_ADMIN);
    const created = (await submit(rifan.token, valid(TODAY))).body.data;
    if (status === 'REJECTED') await reject(salman.token, created._id, 'Not approved');
    if (status === 'CANCELLED') await request(app).patch(`/api/onsite-work/my/${created._id}/cancel`).set(auth(rifan.token));
    expect((await OnsiteWorkRequest.findById(created._id)).status).toBe(status);
    expect((await checkIn(rifan.token, SHOOT)).status).toBe(403);
  });

  test('approval for another date does not authorise today', async () => {
    const { rifan } = await approvedFor(plusDays(1));
    expect((await checkIn(rifan.token, SHOOT)).status).toBe(403);
  });

  test('checked in at the UAE site, approved later the same day: check-out onsite is allowed and the day is Onsite Work', async () => {
    const rifan = await setupRifan();
    const salman = await setup('salman@zorx.test', ROLES.SUPER_ADMIN);
    expect((await checkIn(rifan.token, UAE_SITE)).status).toBe(200);
    const created = (await submit(rifan.token, valid(TODAY))).body.data;
    expect((await checkOut(rifan.token, SHOOT)).status).toBe(403); // still pending
    await approve(salman.token, created._id);
    const out = await checkOut(rifan.token, SHOOT);
    expect(out.status).toBe(200);
    expect(out.body.data.attendanceMode).toBe('ONSITE');
  });

  test('a same-day approval is still checked on the server even if his record says permanent WFH', async () => {
    const { rifan } = await approvedFor(TODAY);
    await Employee.updateOne({ _id: RIFAN_ID }, { workMode: WORK_MODE.WFH });
    const res = await checkIn(rifan.token, SHOOT);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ attendanceMode: 'ONSITE' });
    expect(res.body.data.checkIn.latitude).toBe(SHOOT.latitude);
  });

  test('the dashboard today endpoint reports the approval (and nothing for others)', async () => {
    const { rifan } = await approvedFor(TODAY);
    const today = await request(app).get('/api/attendance/me/today').set(auth(rifan.token));
    expect(today.body.data.onsiteToday).toMatchObject({ approved: true, workLocation: 'Dubai Marina — client shoot' });
    const other = await setup('other@zorx.test');
    expect((await request(app).get('/api/attendance/me/today').set(auth(other.token))).body.data.onsiteToday).toBeNull();
  });

  test('Indian office employees are unaffected', async () => {
    await approvedFor(TODAY);
    const other = await setup('office@zorx.test');
    expect((await checkIn(other.token, SHOOT)).status).toBe(403);
    const ok = await checkIn(other.token, metresNorth(OFFICE, 40));
    expect(ok.status).toBe(200);
    expect(ok.body.data.attendanceMode).toBe('OFFICE');
  });

  test('Salary Report calendar and attendance CSV mark the onsite day', async () => {
    const { rifan, salman } = await approvedFor(TODAY);
    await checkIn(rifan.token, SHOOT);
    await checkOut(rifan.token, SHOOT);
    const salary = await request(app).get(`/api/reports/salary?month=${TODAY.slice(0, 7)}&employeeId=${RIFAN_ID}`).set(auth(salman.token));
    expect(salary.status).toBe(200);
    const cell = salary.body.meta.calendars[0].weeks.flat().find((c) => c?.dateKey === TODAY);
    expect(cell).toMatchObject({ kind: 'record', onsite: true });
    const csv = await request(app).get(`/api/reports/attendance?format=csv&from=${TODAY}&to=${TODAY}`).set(auth(salman.token));
    expect(csv.status).toBe(200);
    expect(csv.text.split('\n')[0]).toMatch(/Work Mode/);
    expect(csv.text).toMatch(/Onsite Work/);
    const pdf = await request(app).get(`/api/reports/salary?month=${TODAY.slice(0, 7)}&employeeId=${RIFAN_ID}&format=pdf`).set(auth(salman.token)).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.body.toString('latin1')).toMatch(/Onsite Work/);
  });
});
