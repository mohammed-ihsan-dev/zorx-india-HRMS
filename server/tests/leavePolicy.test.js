import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Leave } from '../src/models/Leave.js';
import { LeaveBalance } from '../src/models/LeaveBalance.js';
import { LeaveLock } from '../src/models/LeaveLock.js';
import { Notification } from '../src/models/Notification.js';
import { ROLES, LEAVE_TYPE } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const DAY_MS = 86400000;

// Requests use a month 2 months ahead so the "no past dates" rule never interferes.
const now = new Date();
const futureMonth = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 2 };
const future = (day) => new Date(Date.UTC(futureMonth.y, futureMonth.m, day)).toISOString().slice(0, 10);
// Casual credits a long-serving employee has earned by that month (accrual began Oct 2026).
const monthIdx = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();
const CREDITS_BY_FUTURE_MONTH = monthIdx(new Date(future(1))) - (2026 * 12 + 9) + 1;

async function setup(role, email, joiningDate) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: role, lastName: 'Test', joiningDate });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}

const longServing = (email = 'old@zorx.test') => setup(ROLES.EMPLOYEE, email, new Date('2024-01-15'));
const admin = () => setup(ROLES.ADMIN, 'admin@zorx.test', new Date('2024-01-15'));
const submit = (token, leaveType, date, endDate = date) =>
  request(app).post('/api/leaves').set('Authorization', `Bearer ${token}`).send({ leaveType, startDate: date, endDate, reason: 'Testing leave policy' });
const approve = (token, id) => request(app).patch(`/api/leaves/${id}/approve`).set('Authorization', `Bearer ${token}`).send({});
const addDays = (dateStr, n) => new Date(new Date(dateStr).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** Uses up all but `leave` casual days for the long-serving employee via existing approved leave. */
async function spendCasual(employeeId, keep) {
  const spend = CREDITS_BY_FUTURE_MONTH - keep;
  if (spend > 0) {
    await Leave.create({ employeeId, leaveType: LEAVE_TYPE.CASUAL, startDate: new Date(future(1)), endDate: new Date(addDays(future(1), spend - 1)), days: spend, reason: 'Earlier leave', status: 'APPROVED' });
  }
}

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('leave types', () => {
  test.each([LEAVE_TYPE.EARNED, LEAVE_TYPE.UNPAID])('%s can no longer be requested', async (type) => {
    const { token } = await longServing();
    expect((await submit(token, type, future(20))).status).toBe(400);
    expect(await Leave.countDocuments({})).toBe(0);
  });

  test('Paid Leave can be requested for several days, with no limit', async () => {
    const { token } = await longServing();
    expect((await submit(token, LEAVE_TYPE.PAID, future(20), future(24))).status).toBe(201);
    expect((await submit(token, LEAVE_TYPE.PAID, future(26))).status).toBe(201);
  });
});

describe('Sick Leave', () => {
  test('an employee who joined less than 3 months before the leave date cannot request it', async () => {
    const recent = new Date(Date.now() - 10 * DAY_MS);
    const { token } = await setup(ROLES.EMPLOYEE, 'new@zorx.test', recent);
    const res = await submit(token, LEAVE_TYPE.SICK, new Date(recent.getTime() + 20 * DAY_MS).toISOString().slice(0, 10));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/3 months after joining/);
  });

  test('stays at 1 day per month with no carry-forward', async () => {
    const { token } = await longServing();
    expect((await submit(token, LEAVE_TYPE.SICK, future(20))).status).toBe(201);
    expect((await submit(token, LEAVE_TYPE.SICK, future(22))).status).toBe(400);
  });
});

describe('Casual Leave balance (accrual with carry-forward)', () => {
  test('all accrued days can be used together; one more is refused with the balance details', async () => {
    const { token } = await longServing();
    const n = CREDITS_BY_FUTURE_MONTH;
    expect((await submit(token, LEAVE_TYPE.CASUAL, future(10), addDays(future(10), n - 1))).status).toBe(201);
    const over = await submit(token, LEAVE_TYPE.CASUAL, future(25));
    expect(over.status).toBe(400);
    expect(over.body.message).toMatch(/Not enough Casual Leave/);
    expect(over.body.details).toMatchObject({ available: 0, requested: 1, shortfall: 1 });
  });

  test('an over-balance request is refused, never converted to Paid Leave', async () => {
    const { employee, token } = await longServing();
    await spendCasual(employee._id, 0);
    expect((await submit(token, LEAVE_TYPE.CASUAL, future(25))).status).toBe(400);
    expect(await Leave.countDocuments({ leaveType: LEAVE_TYPE.PAID })).toBe(0);
    expect((await submit(token, LEAVE_TYPE.PAID, future(25))).status).toBe(201);
  });

  test('a pending request holds its day; cancelling it releases the day again', async () => {
    const { employee, token } = await longServing();
    await spendCasual(employee._id, 1);
    const first = await submit(token, LEAVE_TYPE.CASUAL, future(20));
    expect(first.status).toBe(201);
    expect((await submit(token, LEAVE_TYPE.CASUAL, future(22))).status).toBe(400);
    await request(app).patch(`/api/leaves/${first.body.data._id}/cancel`).set('Authorization', `Bearer ${token}`);
    expect((await submit(token, LEAVE_TYPE.CASUAL, future(22))).status).toBe(201);
  });

  test('a rejected request releases its day', async () => {
    const emp = await longServing();
    const adm = await admin();
    await spendCasual(emp.employee._id, 1);
    const first = await submit(emp.token, LEAVE_TYPE.CASUAL, future(20));
    await request(app).patch(`/api/leaves/${first.body.data._id}/reject`).set('Authorization', `Bearer ${adm.token}`).send({});
    expect((await submit(emp.token, LEAVE_TYPE.CASUAL, future(22))).status).toBe(201);
  });

  test('an employee cannot submit leave for someone else via the payload', async () => {
    const victim = await longServing('victim@zorx.test');
    const attacker = await longServing('attacker@zorx.test');
    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ leaveType: LEAVE_TYPE.CASUAL, startDate: future(20), endDate: future(20), reason: 'Spoof', employeeId: victim.employee._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.data.employeeId).toBe(attacker.employee._id.toString());
    expect(await Leave.countDocuments({ employeeId: victim.employee._id })).toBe(0);
  });
});

describe('concurrency and retries', () => {
  test('simultaneous submissions cannot overspend the last remaining day', async () => {
    const { employee, token } = await longServing();
    await spendCasual(employee._id, 1);
    const results = await Promise.all([20, 22, 24, 26].map((d) => submit(token, LEAVE_TYPE.CASUAL, future(d))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => [201, 400].includes(r.status))).toBe(true);
    expect(await Leave.countDocuments({ employeeId: employee._id, status: 'PENDING' })).toBe(1);
    expect(await LeaveLock.countDocuments({})).toBe(0);
  });

  test('a double-clicked or retried approval approves once and notifies once', async () => {
    const emp = await longServing();
    const adm = await admin();
    const created = await submit(emp.token, LEAVE_TYPE.CASUAL, future(20));
    const results = await Promise.all([approve(adm.token, created.body.data._id), approve(adm.token, created.body.data._id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await Notification.countDocuments({ userId: emp.user._id, type: 'LEAVE_APPROVED' })).toBe(1);
    expect((await approve(adm.token, created.body.data._id)).status).toBe(400);
  });

  test('two different pending requests approved at the same time cannot both spend the last day', async () => {
    const emp = await longServing();
    const adm = await admin();
    await spendCasual(emp.employee._id, 1);
    // Two pending requests that both predate the balance check (e.g. created under the old rules).
    const make = (d) => Leave.create({ employeeId: emp.employee._id, leaveType: LEAVE_TYPE.CASUAL, startDate: new Date(future(d)), endDate: new Date(future(d)), days: 1, reason: 'Old request', status: 'PENDING' });
    const [a, b] = await Promise.all([make(20), make(22)]);
    const results = await Promise.all([approve(adm.token, a._id), approve(adm.token, b._id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await Leave.countDocuments({ employeeId: emp.employee._id, status: 'APPROVED', startDate: { $gte: new Date(future(20)) } })).toBe(1);
  });
});

describe('GET /api/leaves/me', () => {
  test('returns the casual balance and creates no records, however often it is called', async () => {
    const { employee, token } = await longServing();
    await spendCasual(employee._id, CREDITS_BY_FUTURE_MONTH); // nothing spent
    const calls = await Promise.all(Array.from({ length: 5 }, () => request(app).get('/api/leaves/me').set('Authorization', `Bearer ${token}`)));
    const balances = calls.map((r) => r.body.data.summary.types.CASUAL.available);
    expect(new Set(balances).size).toBe(1);
    expect(calls[0].body.data.summary.types).toMatchObject({
      CASUAL: { accruesPerMonth: 1, approved: 0, pending: 0 },
      SICK: { allowance: 1, used: 0, eligibleNow: true },
      PAID: { allowance: null, used: 0 },
    });
    expect(Object.keys(calls[0].body.data.summary.types)).toEqual(['CASUAL', 'SICK', 'PAID']);
    expect(await LeaveBalance.countDocuments({})).toBe(0);
    expect(await Leave.countDocuments({})).toBe(0);
  });
});
