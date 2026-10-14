import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Leave } from '../src/models/Leave.js';
import * as leaveService from '../src/services/leaveService.js';
import { ROLES, LEAVE_TYPE } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const ymd = (d) => (d ? d.toISOString().slice(0, 10) : null);
const eligible = (joining) => ymd(leaveService.getSickLeaveEligibleFrom(joining ? new Date(joining) : joining));

async function setup(role, email, joiningDate) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: role, lastName: 'Test', joiningDate });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { employee, token };
}
const submitSick = (token, date) =>
  request(app).post('/api/leaves').set('Authorization', `Bearer ${token}`).send({ leaveType: LEAVE_TYPE.SICK, startDate: date, endDate: date, reason: 'Unwell today' });

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('eligibility date: 3-month anniversary of the joining date', () => {
  test.each([
    ['Mohammed Ihsan', '2026-09-12', '2026-12-12'],
    ['Muhammed Ajmal', '2026-09-11', '2026-12-11'],
    ['Shijin P', '2026-09-12', '2026-12-12'],
    ['Neethu N', '2026-09-01', '2026-12-01'],
    ['Nahida Sherin K', '2026-09-01', '2026-12-01'],
    ['Shamila Sherin K.P', '2026-09-07', '2026-12-07'],
    ['Mishab P', '2026-09-01', '2026-12-01'],
    ['Goutham Krishna', '2026-09-21', '2026-12-21'],
    ['Krishna Kumar', '2026-09-23', '2026-12-23'],
    ['Safna [HR]', '2026-10-01', '2027-01-01'],
  ])('%s: joined %s → eligible %s', (_name, joining, expected) => {
    expect(eligible(joining)).toBe(expected);
  });

  test.each([
    ['2026-11-30', '2027-02-28'], // shorter target month → last day
    ['2026-11-29', '2027-02-28'],
    ['2026-08-31', '2026-11-30'],
    ['2027-11-30', '2028-02-29'], // leap year
    ['2026-10-31', '2027-01-31'], // across year-end
    ['2026-12-15', '2027-03-15'],
    ['2026-01-31', '2026-04-30'],
  ])('month-end / year-end: joined %s → eligible %s', (joining, expected) => {
    expect(eligible(joining)).toBe(expected);
  });

  test.each([null, undefined, 'not-a-date'])('missing or invalid joining date (%s) → no eligibility date', (joining) => {
    expect(leaveService.getSickLeaveEligibleFrom(joining === 'not-a-date' ? new Date('x') : joining)).toBeNull();
  });
});

describe('enforcement around the eligibility date', () => {
  const employee = (joiningDate) => ({ _id: undefined, joiningDate: new Date(joiningDate) });

  test('day before is refused; the exact day and the day after are allowed', async () => {
    const e = employee('2026-09-12');
    await expect(leaveService.assertLeaveAllowed(e, LEAVE_TYPE.SICK, new Date('2026-12-11'), 1)).rejects.toMatchObject({ statusCode: 400 });
    await expect(leaveService.assertLeaveAllowed(e, LEAVE_TYPE.SICK, new Date('2026-12-12'), 1)).resolves.toBeUndefined();
    await expect(leaveService.assertLeaveAllowed(e, LEAVE_TYPE.SICK, new Date('2026-12-13'), 1)).resolves.toBeUndefined();
  });

  test('a missing joining date means not eligible (never "no restriction")', async () => {
    await expect(leaveService.assertLeaveAllowed({ joiningDate: null }, LEAVE_TYPE.SICK, new Date('2030-01-01'), 1)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/joining date/),
    });
    const summary = await leaveService.getLeaveSummary({ joiningDate: null }, new Date('2030-01-01'));
    expect(summary.types.SICK).toMatchObject({ eligibleFrom: null, eligibleNow: false });
  });

  test('the summary reports the eligibility date and flips on that exact day', async () => {
    const e = employee('2026-09-12');
    const before = await leaveService.getLeaveSummary(e, new Date('2026-12-11T23:59:59Z'));
    const on = await leaveService.getLeaveSummary(e, new Date('2026-12-12T00:00:00Z'));
    expect(ymd(before.types.SICK.eligibleFrom)).toBe('2026-12-12');
    expect(before.types.SICK.eligibleNow).toBe(false);
    expect(on.types.SICK.eligibleNow).toBe(true);
  });
});

describe('Sick Leave over the API', () => {
  test('a direct API request before eligibility is refused with the date', async () => {
    const recent = new Date();
    recent.setUTCDate(recent.getUTCDate() - 5);
    const { token } = await setup(ROLES.EMPLOYEE, 'new@zorx.test', recent);
    const inTenDays = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const res = await submitSick(token, inTenDays);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/3 months after joining \(from/);
    expect(await Leave.countDocuments({})).toBe(0);
  });

  test('after eligibility: 1 day per month, no carry-forward, approvals unaffected', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'old@zorx.test', new Date('2024-01-15'));
    const now = new Date();
    const m1 = (d) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, d)).toISOString().slice(0, 10);
    const m2 = (d) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, d)).toISOString().slice(0, 10);
    expect((await submitSick(token, m1(10))).status).toBe(201);
    expect((await submitSick(token, m1(20))).status).toBe(400);
    // An unused month does not add a second day to the next month.
    const twoDays = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({ leaveType: LEAVE_TYPE.SICK, startDate: m2(10), endDate: m2(11), reason: 'Two days' });
    expect(twoDays.status).toBe(400);
    expect((await submitSick(token, m2(12))).status).toBe(201);
  });

  test('a corrected joining date takes effect immediately; Casual accrual is unaffected', async () => {
    const admin = await setup(ROLES.ADMIN, 'admin@zorx.test', new Date('2024-01-15'));
    const { employee, token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test', new Date('2026-10-12'));
    const summaryOf = async () => (await request(app).get('/api/leaves/me').set('Authorization', `Bearer ${token}`)).body.data.summary.types;

    const before = await summaryOf();
    expect(before.SICK.eligibleFrom.slice(0, 10)).toBe('2027-01-12');

    const fix = await request(app)
      .patch(`/api/employees/${employee._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ joiningDate: '2026-09-12' });
    expect(fix.status).toBe(200);

    const after = await summaryOf();
    expect(after.SICK.eligibleFrom.slice(0, 10)).toBe('2026-12-12');
    // Both dates fall before the Oct 2026 accrual start, so Casual is identical.
    expect(after.CASUAL.creditStart).toBe(before.CASUAL.creditStart);
    expect(after.CASUAL.available).toBe(before.CASUAL.available);
  });

  test('an employee cannot change their own joining date to unlock Sick Leave', async () => {
    const { employee, token } = await setup(ROLES.EMPLOYEE, 'emp@zorx.test', new Date('2026-10-12'));
    await request(app).patch('/api/employees/me/profile').set('Authorization', `Bearer ${token}`).send({ joiningDate: '2020-01-01' });
    const direct = await request(app).patch(`/api/employees/${employee._id}`).set('Authorization', `Bearer ${token}`).send({ joiningDate: '2020-01-01' });
    expect(direct.status).toBe(403);
    expect((await Employee.findById(employee._id)).joiningDate.toISOString().slice(0, 10)).toBe('2026-10-12');
  });
});
