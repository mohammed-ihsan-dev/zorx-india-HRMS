import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Leave } from '../src/models/Leave.js';
import * as leaveService from '../src/services/leaveService.js';
import { ROLES, LEAVE_TYPE } from '../src/utils/constants.js';

// Sick Leave = the Casual Leave accrual (1/month, unlimited carry-forward,
// pending holds, approval re-checks) with its own start: the second calendar
// month after the joining month, never before the policy start (October 2026).
const app = createApp();
const PASSWORD = 'Test@12345';
const ym = (d) => (d ? d.toISOString().slice(0, 7) : null);
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const eligible = (joining) => ym(leaveService.getSickLeaveEligibleFrom(joining ? day(joining) : joining));
const credits = (joining, on) => leaveService.creditsThrough(LEAVE_TYPE.SICK, day(joining), day(on));

// Dates relative to the current month, so the tests keep working over time.
const now = new Date();
const monthStart = (k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
const at = (k, d) => {
  const s = monthStart(k);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), d)).toISOString().slice(0, 10);
};

async function setup(role, email, joiningDate) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: role, lastName: 'Test', joiningDate });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const submit = (token, start, end = start, extra = {}) =>
  request(app).post('/api/leaves').set(auth(token)).send({ leaveType: LEAVE_TYPE.SICK, startDate: start, endDate: end, reason: 'Unwell today', ...extra });
const half = (token, date, session = 'MORNING') => submit(token, date, date, { duration: 'HALF_DAY', halfDaySession: session });
const summary = async (token) => (await request(app).get('/api/leaves/me').set(auth(token))).body.data.summary.types.SICK;

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearTestDb);

describe('eligibility: joining month + 2 calendar months', () => {
  test.each([
    ['2026-09-15', '2026-11'],
    ['2026-10-01', '2026-12'],
    ['2026-11-30', '2027-01'], // the formula (confirmed): November → January
    ['2026-12-01', '2027-02'], // across the year end
    ['2026-12-31', '2027-02'],
    ['2027-01-01', '2027-03'],
    ['2027-11-15', '2028-01'],
  ])('joined %s → first Sick Leave month %s', (joining, expected) => {
    expect(eligible(joining)).toBe(expected);
  });

  test('uses only the stored joining date; first and last day of a month behave the same', () => {
    expect(eligible('2026-09-01')).toBe(eligible('2026-09-30'));
    expect(eligible(null)).toBeNull();
    expect(eligible(undefined)).toBeNull();
  });

  test('never before the policy start (October 2026), like Casual Leave: no back-dated credits', () => {
    expect(eligible('2026-03-19')).toBe('2026-10'); // would be May 2026 without the policy start
    expect(eligible('2024-01-15')).toBe('2026-10');
    expect(eligible('2026-08-28')).toBe('2026-10');
  });
});

describe('accrual and carry-forward (pure calculation)', () => {
  test('September joiner: none in Sep/Oct, then 1 per month, carried forward without a cap', () => {
    expect(credits('2026-09-10', '2026-09-30')).toBe(0);
    expect(credits('2026-09-10', '2026-10-31')).toBe(0);
    expect(credits('2026-09-10', '2026-11-15')).toBe(1);
    expect(credits('2026-09-10', '2026-12-15')).toBe(2);
    expect(credits('2026-09-10', '2027-02-15')).toBe(4);
    expect(credits('2026-09-10', '2028-10-15')).toBe(24); // no cap
  });
  test('November joiner: first credit in January 2027', () => {
    expect(credits('2026-11-05', '2026-12-31')).toBe(0);
    expect(credits('2026-11-05', '2027-01-10')).toBe(1);
    expect(credits('2026-11-05', '2027-02-10')).toBe(2);
  });
  test('no joining date → no Sick Leave credits (Casual is unaffected)', () => {
    expect(leaveService.creditsThrough(LEAVE_TYPE.SICK, null, day('2027-01-10'))).toBe(0);
    expect(leaveService.creditsThrough(LEAVE_TYPE.CASUAL, null, day('2027-01-10'))).toBeGreaterThan(0);
  });
});

describe('Sick Leave over the API (same workflow as Casual Leave)', () => {
  // Joined long ago → credits since the policy start; balances come from creditsThrough.
  const JOINED = '2026-05-01';
  const creditFor = (k) => leaveService.creditsThrough(LEAVE_TYPE.SICK, day(JOINED), monthStart(k));

  test('before the first eligible month a request is refused with the month', async () => {
    const joining = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3)); // joined this month
    const { token } = await setup(ROLES.EMPLOYEE, 'new@zorx.test', joining);
    const res = await submit(token, at(1, 10));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Sick Leave is available from .* \(the second calendar month after your joining month\)/);
    expect((await submit(token, at(2, 10))).status).toBe(201); // joining month + 2
    expect(await summary(token)).toMatchObject({ eligibleNow: false, credited: 0, available: 0 });
  });

  test('a missing joining date means not eligible', async () => {
    const { token, employee } = await setup(ROLES.EMPLOYEE, 'nodate@zorx.test', day(JOINED));
    await Employee.collection.updateOne({ _id: employee._id }, { $unset: { joiningDate: '' } });
    const res = await submit(token, at(1, 10));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/needs a joining date/);
  });

  test('unused days carry forward: several days together in a later month; multiple requests in one month', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'asha@zorx.test', day(JOINED));
    const avail = creditFor(3); // available for a leave three months ahead
    expect(avail).toBeGreaterThanOrEqual(4);
    expect((await submit(token, at(3, 2), at(3, 3))).status).toBe(201); // 2 days at once
    expect((await submit(token, at(3, 9))).status).toBe(201); // another request, same month
    expect((await submit(token, at(3, 16))).status).toBe(201); // and another
    const s = await summary(token);
    expect(s).toMatchObject({ accruesPerMonth: 1, pending: 4, approved: 0 });
    // The next request beyond the balance is refused (insufficient balance), never converted.
    const rest = avail - 4;
    if (rest > 0) expect((await submit(token, at(3, 20), at(3, 19 + rest))).status).toBe(201);
    const over = await submit(token, at(3, 27));
    expect(over.status).toBe(400);
    expect(over.body.message).toMatch(/Not enough Sick Leave: 0 days available .* You can choose Paid Leave instead\./);
    expect(await Leave.countDocuments({ leaveType: { $ne: LEAVE_TYPE.SICK } })).toBe(0);
  });

  test('half days count 0.5 (same conversion as Casual): two halves = one day, no double deduction', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'half@zorx.test', day(JOINED));
    expect((await half(token, at(1, 5), 'MORNING')).status).toBe(201);
    expect((await half(token, at(1, 5), 'EVENING')).status).toBe(201);
    expect((await half(token, at(1, 6))).status).toBe(201);
    expect((await Leave.find({ leaveType: LEAVE_TYPE.SICK }).lean()).map((l) => l.days)).toEqual([0.5, 0.5, 0.5]);
    expect((await summary(token)).pending).toBe(1.5);
  });

  test('pending reserves; approval deducts once; reject and cancel release; re-approval is refused', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'flow@zorx.test', day(JOINED));
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test', day('2025-01-01'));
    const a = (await submit(token, at(1, 5))).body.data;
    const b = (await submit(token, at(1, 6))).body.data;
    const c = (await submit(token, at(1, 7))).body.data;
    expect(await summary(token)).toMatchObject({ pending: 3, approved: 0 }); // pending holds the days

    expect((await request(app).patch(`/api/leaves/${a._id}/approve`).set(auth(hr.token)).send({})).status).toBe(200);
    expect((await request(app).patch(`/api/leaves/${a._id}/approve`).set(auth(hr.token)).send({})).status).toBe(400); // no double approval
    expect((await request(app).patch(`/api/leaves/${b._id}/reject`).set(auth(hr.token)).send({ reviewNote: 'no' })).status).toBe(200);
    expect((await request(app).patch(`/api/leaves/${c._id}/cancel`).set(auth(token))).status).toBe(200);
    const after = await summary(token);
    expect(after).toMatchObject({ approved: 1, pending: 0 }); // one deduction; rejected + cancelled released
    expect(after.available).toBe(Math.max(0, after.credited - 1));
  });

  test('approval re-checks the balance: only approved leave counts, so any of several pending can be approved', async () => {
    const { token, employee } = await setup(ROLES.EMPLOYEE, 'rec@zorx.test', day(JOINED));
    const hr = await setup(ROLES.ADMIN, 'hr2@zorx.test', day('2025-01-01'));
    const avail = creditFor(1);
    const ids = [];
    for (let i = 0; i < avail; i++) ids.push((await submit(token, at(1, 2 + i))).body.data._id);
    expect((await submit(token, at(1, 25))).status).toBe(400); // all reserved
    // HR approves the last one first — allowed.
    expect((await request(app).patch(`/api/leaves/${ids.at(-1)}/approve`).set(auth(hr.token)).send({})).status).toBe(200);
    expect(await Leave.countDocuments({ employeeId: employee._id, status: 'APPROVED' })).toBe(1);
  });
});

describe('summary shape (employee and HR see the same calculation)', () => {
  test('Sick Leave reports credits, pending, approved, available and the first eligible month', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 's@zorx.test', day('2026-09-10'));
    const s = await summary(token);
    expect(s).toMatchObject({ accruesPerMonth: 1, approved: 0, pending: 0 });
    expect(s.eligibleFrom.slice(0, 7)).toBe('2026-11');
    expect(s.creditStart.slice(0, 7)).toBe('2026-11');
    expect(s.available).toBe(s.credited);
  });
});

describe('HR/Admin balance view', () => {
  test('HR sees the same Sick and Casual balances as the employee; employees cannot read others', async () => {
    const emp = await setup(ROLES.EMPLOYEE, 'emp@zorx.test', day('2026-05-01'));
    const other = await setup(ROLES.EMPLOYEE, 'other@zorx.test', day('2026-05-01'));
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test', day('2025-01-01'));
    await submit(emp.token, at(1, 4));
    const own = (await request(app).get('/api/leaves/me').set(auth(emp.token))).body.data.summary;
    const res = await request(app).get(`/api/leaves/balance/${emp.employee._id}`).set(auth(hr.token));
    expect(res.status).toBe(200);
    expect(res.body.data.types.SICK).toEqual(own.types.SICK);
    expect(res.body.data.types.CASUAL).toEqual(own.types.CASUAL);
    expect(res.body.data.types.SICK).toMatchObject({ pending: 1 });
    expect((await request(app).get(`/api/leaves/balance/${emp.employee._id}`).set(auth(other.token))).status).toBe(403);
  });
});
