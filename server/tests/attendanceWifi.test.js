import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { Attendance } from '../src/models/Attendance.js';
import { WorkFromHome } from '../src/models/WorkFromHome.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { getStartOfDayUTC } from '../src/utils/dateUtils.js';
import { parseAllowlist, isIpAllowed, normalizeIp } from '../src/utils/networkAllowlist.js';
import { ROLES, WORK_MODE } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const OFFICE_IP = '43.229.89.156';
const HOME_IP = '49.37.12.200';
const INSIDE = { latitude: 10.991501, longitude: 76.442772 };
const FAR = { latitude: 9.9312, longitude: 76.2673 };
const ORIGINAL_ALLOWED = env.attendanceNetwork.allowedIps;

// The production proxy APPENDS the real source IP as the last X-Forwarded-For
// entry; with trust proxy = 1 Express uses exactly that entry as req.ip.
// Everything to its left is client-controlled and must be ignored.
const via = (realIp, forged) => ({ 'X-Forwarded-For': forged ? `${forged}, ${realIp}` : realIp });

async function setup(role, email, extra = {}) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: role, lastName: 'Test', joiningDate: new Date('2025-01-01'), ...extra });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { employee, token };
}
const punch = (kind, token, headers = {}, body = {}) =>
  request(app).post(`/api/attendance/check-${kind}`).set('Authorization', `Bearer ${token}`).set(headers).send(body);
const setMode = (mode) => OfficeSettings.updateOne({}, { $set: { attendanceVerificationMode: mode } });

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  env.attendanceNetwork.allowedIps = ORIGINAL_ALLOWED;
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  env.attendanceNetwork.allowedIps = OFFICE_IP;
  await OfficeSettings.create({
    officeName: 'ZORX INDIA', latitude: 10.991401, longitude: 76.442772, attendanceRadius: 200,
    workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: 'Asia/Kolkata',
    lateThresholdMinutes: 15, halfDayThresholdMinutes: 240, overtimeEnabled: true,
  });
});

describe('allowlist parsing and matching', () => {
  test('exact IPv4, IPv6 /64 prefix and IPv4-mapped IPv6 match correctly', () => {
    const list = parseAllowlist('43.229.89.156, 2403:a080:84f:ca41::/64');
    expect(list.ok).toBe(true);
    expect(isIpAllowed('43.229.89.156', list)).toBe(true);
    expect(isIpAllowed('::ffff:43.229.89.156', list)).toBe(true);
    expect(isIpAllowed('43.229.89.157', list)).toBe(false);
    expect(isIpAllowed('2403:a080:84f:ca41:f099:7463:5e6e:432e', list)).toBe(true);
    expect(isIpAllowed('2403:a080:84f:ca41:1:2:3:4', list)).toBe(true);
    expect(isIpAllowed('2403:a080:84f:ca42::1', list)).toBe(false);
  });

  test('private router/LAN addresses, malformed entries and an empty list are all invalid (fail closed)', () => {
    for (const bad of ['192.168.220.1', '192.168.220.69', '10.0.0.5', 'd6:f7:64:75:c4:20', '43.229.89.156/40', 'not-an-ip', '']) {
      const list = parseAllowlist(bad);
      expect(list.ok).toBe(false);
      expect(isIpAllowed('43.229.89.156', list)).toBe(false);
    }
    expect(parseAllowlist('43.229.89.156, 192.168.220.1').ok).toBe(false);
  });

  test('normalizeIp rejects non-IP input', () => {
    expect(normalizeIp('  43.229.89.156 ')).toBe('43.229.89.156');
    expect(normalizeIp('d6:f7:64:75:c4:20')).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });
});

describe('Admin verification-mode setting', () => {
  const patch = (token, body) => request(app).patch('/api/settings/office').set('Authorization', `Bearer ${token}`).send(body);

  test('defaults to GPS', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    const res = await request(app).get('/api/settings/office').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.attendanceVerificationMode).toBe('GPS');
  });

  test('Admin and Super Admin can switch modes; the change is persisted and audited', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    const sup = await setup(ROLES.SUPER_ADMIN, 'super@zorx.test');
    expect((await patch(admin.token, { attendanceVerificationMode: 'WIFI' })).body.data.attendanceVerificationMode).toBe('WIFI');
    expect((await OfficeSettings.findOne()).attendanceVerificationMode).toBe('WIFI');
    expect((await patch(sup.token, { attendanceVerificationMode: 'GPS' })).body.data.attendanceVerificationMode).toBe('GPS');
    expect(await AuditLog.countDocuments({ description: /attendance verification: GPS → WIFI/ })).toBe(1);
  });

  test('employees cannot change the mode', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    expect((await patch(token, { attendanceVerificationMode: 'WIFI' })).status).toBe(403);
    expect((await OfficeSettings.findOne()).attendanceVerificationMode).toBe('GPS');
  });

  test('an invalid mode value is rejected', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    expect((await patch(admin.token, { attendanceVerificationMode: 'BLUETOOTH' })).status).toBe(400);
  });

  test('Wi-Fi mode cannot be enabled while the server allowlist is missing or invalid', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    for (const bad of ['', '192.168.220.1']) {
      env.attendanceNetwork.allowedIps = bad;
      const res = await patch(admin.token, { attendanceVerificationMode: 'WIFI' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot be enabled/);
    }
    expect((await OfficeSettings.findOne()).attendanceVerificationMode).toBe('GPS');
  });

  test('the allowlist is never included in settings responses', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    const res = await request(app).get('/api/settings/office').set('Authorization', `Bearer ${admin.token}`);
    expect(JSON.stringify(res.body)).not.toContain(OFFICE_IP);
  });
});

describe('GPS mode (default) — unchanged', () => {
  test('office radius still enforced; no network check', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    expect((await punch('in', token, via(OFFICE_IP), FAR)).status).toBe(403);
    expect((await punch('in', token, via(HOME_IP), INSIDE)).status).toBe(200);
  });

  test('coordinates are still required', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    expect((await punch('in', token, via(OFFICE_IP), {})).status).toBe(400);
  });
});

describe('Company Wi-Fi mode', () => {
  beforeEach(() => setMode('WIFI'));

  test('check-in and check-out from the company network succeed without location', async () => {
    const { employee, token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    const inRes = await punch('in', token, via(OFFICE_IP));
    expect(inRes.status).toBe(200);
    expect(inRes.body.data.checkIn).toMatchObject({ latitude: null, longitude: null, distanceFromOffice: null });
    expect(inRes.body.data.attendanceMode).toBe('OFFICE');
    expect((await punch('out', token, via(OFFICE_IP))).status).toBe(200);
    expect(await Attendance.countDocuments({ employeeId: employee._id })).toBe(1);
  });

  test('a request from another network is rejected, and no attendance is written', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    const res = await punch('in', token, via(HOME_IP));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/company network could not be verified/);
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('check-out is enforced too', async () => {
    const { employee, token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    await punch('in', token, via(OFFICE_IP));
    expect((await punch('out', token, via(HOME_IP))).status).toBe(403);
    expect((await Attendance.findOne({ employeeId: employee._id })).checkOut).toBeNull();
  });

  test('a forged X-Forwarded-For entry cannot impersonate the office IP', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    expect((await punch('in', token, via(HOME_IP, OFFICE_IP))).status).toBe(403);
    expect((await punch('in', token, { ...via(HOME_IP, OFFICE_IP), 'CF-Connecting-IP': OFFICE_IP, 'True-Client-IP': OFFICE_IP, 'X-Real-IP': OFFICE_IP })).status).toBe(403);
  });

  test('client-supplied IP, MAC, mode or GPS coordinates in the body are ignored', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    const res = await punch('in', token, via(HOME_IP), { ...INSIDE, verificationMode: 'GPS', attendanceVerificationMode: 'GPS', clientIp: OFFICE_IP, ip: OFFICE_IP, macAddress: 'd6:f7:64:75:c4:20' });
    expect(res.status).toBe(403);
  });

  test('a misconfigured allowlist rejects every punch (503), never falls back to GPS', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    env.attendanceNetwork.allowedIps = '';
    const res = await punch('in', token, via(OFFICE_IP), INSIDE);
    expect(res.status).toBe(503);
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  test('permanent-WFH and approved-WFH employees are not required to be on the office network', async () => {
    const remote = await setup(ROLES.EMPLOYEE, 'remote@zorx.test', { workMode: WORK_MODE.WFH });
    const approved = await setup(ROLES.EMPLOYEE, 'approved@zorx.test');
    await WorkFromHome.create({ employeeId: approved.employee._id, date: getStartOfDayUTC(), reason: 'Home', workPlan: 'Work', status: 'APPROVED' });
    expect((await punch('in', remote.token, via(HOME_IP))).body.data.attendanceMode).toBe('WFH');
    expect((await punch('in', approved.token, via(HOME_IP))).body.data.attendanceMode).toBe('WFH');
  });

  test('simultaneous check-ins create exactly one record', async () => {
    const { employee, token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    const results = await Promise.all([1, 2, 3].map(() => punch('in', token, via(OFFICE_IP))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    expect(await Attendance.countDocuments({ employeeId: employee._id })).toBe(1);
  });

  test('network-status reports verification for this request without revealing any IP', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    const ok = await request(app).get('/api/attendance/network-status').set('Authorization', `Bearer ${token}`).set(via(OFFICE_IP));
    const bad = await request(app).get('/api/attendance/network-status').set('Authorization', `Bearer ${token}`).set(via(HOME_IP));
    expect(ok.body.data).toEqual({ mode: 'WIFI', configured: true, verified: true });
    expect(bad.body.data).toEqual({ mode: 'WIFI', configured: true, verified: false });
    expect(JSON.stringify(ok.body)).not.toContain(OFFICE_IP);
  });
});

describe('Admin network diagnostics', () => {
  test('Admin sees what the server detected; employees cannot call it', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'emp@zorx.test');
    const res = await request(app).get('/api/settings/attendance-network/diagnostics').set('Authorization', `Bearer ${admin.token}`).set(via(OFFICE_IP, '1.1.1.1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ detectedIp: OFFICE_IP, detectedIpAllowed: true, allowlist: { configured: true, entryCount: 1, errors: [] } });
    expect((await request(app).get('/api/settings/attendance-network/diagnostics').set('Authorization', `Bearer ${emp.token}`)).status).toBe(403);
  });
});
