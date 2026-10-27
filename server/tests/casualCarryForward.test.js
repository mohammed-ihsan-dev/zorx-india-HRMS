import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Leave } from '../src/models/Leave.js';
import { LeaveLock } from '../src/models/LeaveLock.js';
import { getLeaveSummary } from '../src/services/leaveService.js';
import { ROLES, LEAVE_TYPE } from '../src/utils/constants.js';

// Cumulative Casual Leave: accrued days carry forward and can be spent in any
// number of requests per month, as long as the remaining balance covers them.
const app = createApp();
const PASSWORD = 'Test@12345';

// Request month is 2 months ahead (so "no past dates" never interferes); `at(n, day)` is n months after it.
const now = new Date();
const base = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 2 };
const at = (offset, day) => new Date(Date.UTC(base.y, base.m + offset, day)).toISOString().slice(0, 10);
const monthIdx = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();
// Casual credits a long-serving employee has earned by the request month (accrual began Oct 2026).
const CREDITS = monthIdx(new Date(at(0, 1))) - (2026 * 12 + 9) + 1;

async function setup(role, email) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: role, lastName: 'Test', joiningDate: new Date('2024-01-15') });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}

const employee = () => setup(ROLES.EMPLOYEE, 'emp@zorx.test');
const admin = () => setup(ROLES.ADMIN, 'admin@zorx.test');
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const submit = (token, leaveType, start, end = start) =>
  request(app).post('/api/leaves').set(auth(token)).send({ leaveType, startDate: start, endDate: end, reason: 'Testing carry-forward' });
const approve = (token, id) => request(app).patch(`/api/leaves/${id}/approve`).set(auth(token)).send({});
const reject = (token, id) => request(app).patch(`/api/leaves/${id}/reject`).set(auth(token)).send({});
const cancel = (token, id) => request(app).patch(`/api/leaves/${id}/cancel`).set(auth(token));
const available = async (emp) => (await getLeaveSummary(emp, new Date(at(0, 15)))).types.CASUAL.available;

/** Leaves exactly `keep` casual days available for the request month, via approved leave in a later month. */
async function keepCasual(employeeId, keep) {
  const spend = CREDITS - keep;
  if (spend > 0) {
    const start = at(1, 1);
    const end = new Date(new Date(start).getTime() + (spend - 1) * 86400000);
    await Leave.create({ employeeId, leaveType: LEAVE_TYPE.CASUAL, startDate: new Date(start), endDate: end, days: spend, reason: 'Earlier leave', status: 'APPROVED' });
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

describe('accumulated balance', () => {
  test('carries forward month after month with no cap and no monthly reset', async () => {
    const { employee: emp } = await employee();
    expect(CREDITS).toBeGreaterThanOrEqual(2);
    expect(await available(emp)).toBe(CREDITS);
    expect((await getLeaveSummary(emp, new Date(at(1, 15)))).types.CASUAL.available).toBe(CREDITS + 1);
  });

  test('two accumulated days can be requested together in one application', async () => {
    const { employee: emp, token } = await employee();
    await keepCasual(emp._id, 2);
    expect((await submit(token, LEAVE_TYPE.CASUAL, at(0, 10), at(0, 11))).status).toBe(201);
    expect(await available(emp)).toBe(0);
  });

  test('two accumulated days can be requested as separate applications in the same month', async () => {
    const { employee: emp, token } = await employee();
    await keepCasual(emp._id, 2);
    expect((await submit(token, LEAVE_TYPE.CASUAL, at(0, 10))).status).toBe(201);
    expect((await submit(token, LEAVE_TYPE.CASUAL, at(0, 20))).status).toBe(201);
    expect(await Leave.countDocuments({ employeeId: emp._id, status: 'PENDING' })).toBe(2);
  });

  test('a request beyond the remaining balance is still refused, never converted to Paid Leave', async () => {
    const { employee: emp, token } = await employee();
    await keepCasual(emp._id, 2);
    expect((await submit(token, LEAVE_TYPE.CASUAL, at(0, 10))).status).toBe(201);
    const over = await submit(token, LEAVE_TYPE.CASUAL, at(0, 20), at(0, 21));
    expect(over.status).toBe(400);
    expect(over.body.details).toMatchObject({ available: 1, requested: 2, shortfall: 1 });
    expect(await Leave.countDocuments({ leaveType: LEAVE_TYPE.PAID })).toBe(0);
  });
});

describe('reservation and release', () => {
  test('pending requests reserve their days; approval keeps them spent', async () => {
    const emp = await employee();
    const adm = await admin();
    await keepCasual(emp.employee._id, 2);
    const a = await submit(emp.token, LEAVE_TYPE.CASUAL, at(0, 10));
    const b = await submit(emp.token, LEAVE_TYPE.CASUAL, at(0, 12));
    expect(await available(emp.employee)).toBe(0);
    expect((await submit(emp.token, LEAVE_TYPE.CASUAL, at(0, 14))).status).toBe(400);
    // Both pending requests in the same month can be approved.
    expect((await approve(adm.token, a.body.data._id)).status).toBe(200);
    expect((await approve(adm.token, b.body.data._id)).status).toBe(200);
    expect(await available(emp.employee)).toBe(0);
  });

  test('rejecting a pending request releases its day', async () => {
    const emp = await employee();
    const adm = await admin();
    await keepCasual(emp.employee._id, 1);
    const a = await submit(emp.token, LEAVE_TYPE.CASUAL, at(0, 10));
    expect(await available(emp.employee)).toBe(0);
    expect((await reject(adm.token, a.body.data._id)).status).toBe(200);
    expect(await available(emp.employee)).toBe(1);
    expect((await submit(emp.token, LEAVE_TYPE.CASUAL, at(0, 12))).status).toBe(201);
  });

  test('cancelling a pending or an approved request releases its days', async () => {
    const emp = await employee();
    const adm = await admin();
    await keepCasual(emp.employee._id, 2);
    const pending = await submit(emp.token, LEAVE_TYPE.CASUAL, at(0, 10));
    const approved = await submit(emp.token, LEAVE_TYPE.CASUAL, at(0, 12));
    await approve(adm.token, approved.body.data._id);
    expect(await available(emp.employee)).toBe(0);
    await cancel(emp.token, pending.body.data._id);
    expect(await available(emp.employee)).toBe(1);
    await cancel(emp.token, approved.body.data._id);
    expect(await available(emp.employee)).toBe(2);
    expect((await submit(emp.token, LEAVE_TYPE.CASUAL, at(0, 14), at(0, 15))).status).toBe(201);
  });
});

describe('concurrency', () => {
  test('simultaneous requests can spend the balance exactly once', async () => {
    const { employee: emp, token } = await employee();
    await keepCasual(emp._id, 2);
    const results = await Promise.all([10, 12, 14, 16].map((d) => submit(token, LEAVE_TYPE.CASUAL, at(0, d))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.every((r) => [201, 400].includes(r.status))).toBe(true);
    expect(await available(emp)).toBe(0);
    expect(await LeaveLock.countDocuments({})).toBe(0);
  });
});

describe('other leave types and history are unaffected', () => {
  test('Sick Leave stays 1 day per month; Paid Leave stays unlimited', async () => {
    const { employee: emp, token } = await employee();
    await keepCasual(emp._id, 0);
    expect((await submit(token, LEAVE_TYPE.SICK, at(0, 10))).status).toBe(201);
    expect((await submit(token, LEAVE_TYPE.SICK, at(0, 12))).status).toBe(400);
    expect((await submit(token, LEAVE_TYPE.PAID, at(0, 14), at(0, 18))).status).toBe(201);
    expect((await submit(token, LEAVE_TYPE.PAID, at(0, 20))).status).toBe(201);
  });

  test('existing leave records are not modified by new requests', async () => {
    const { employee: emp, token } = await employee();
    await keepCasual(emp._id, 2);
    const before = await Leave.find({}).lean();
    expect((await submit(token, LEAVE_TYPE.CASUAL, at(0, 10))).status).toBe(201);
    expect((await submit(token, LEAVE_TYPE.CASUAL, at(0, 12))).status).toBe(201);
    expect(await Leave.find({ _id: { $in: before.map((l) => l._id) } }).lean()).toEqual(before);
  });
});
