import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Leave } from '../src/models/Leave.js';
import { getLeaveSummary } from '../src/services/leaveService.js';
import { ROLES, LEAVE_TYPE } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
// Request month 2 months ahead (no "past date" interference); at(n, day) = n months after it.
const now = new Date();
const base = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 2 };
const at = (offset, day) => new Date(Date.UTC(base.y, base.m + offset, day)).toISOString().slice(0, 10);
const monthIdx = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();
const CREDITS = monthIdx(new Date(at(0, 1))) - (2026 * 12 + 9) + 1;

async function setup(role, email, joiningDate = new Date('2024-01-15')) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: role, lastName: 'Test', joiningDate });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const submit = (token, body) => request(app).post('/api/leaves').set(auth(token)).send({ reason: 'Testing half day', ...body });
const half = (token, leaveType, date, halfDaySession, extra = {}) => submit(token, { leaveType, startDate: date, endDate: date, duration: 'HALF_DAY', halfDaySession, ...extra });
const full = (token, leaveType, start, end = start) => submit(token, { leaveType, startDate: start, endDate: end });
const available = async (emp) => (await getLeaveSummary(emp, new Date(at(0, 15)))).types.CASUAL.available;
/** Leaves exactly `keep` casual days for the request month (spent days dated a month later). */
async function keepCasual(employeeId, keep) {
  const spend = CREDITS - keep;
  if (spend > 0) await Leave.create({ employeeId, leaveType: LEAVE_TYPE.CASUAL, startDate: new Date(at(1, 1)), endDate: new Date(new Date(at(1, 1)).getTime() + (spend - 1) * 86400000), days: spend, reason: 'Earlier', status: 'APPROVED' });
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

describe('duration and session', () => {
  test('Full Day stays the default when no duration is sent (existing clients)', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    const res = await full(token, LEAVE_TYPE.PAID, at(0, 10), at(0, 11));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ days: 2, duration: 'FULL_DAY' });
    expect(res.body.data.halfDaySession ?? null).toBeNull();
  });

  test.each(['MORNING', 'EVENING'])('a %s half day consumes 0.5 day', async (session) => {
    const { token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    const res = await half(token, LEAVE_TYPE.PAID, at(0, 10), session);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ days: 0.5, duration: 'HALF_DAY', halfDaySession: session });
  });

  test.each([
    ['without a session', { halfDaySession: undefined }, /Morning or Evening/],
    ['with an invalid session', { halfDaySession: 'NIGHT' }, /Invalid/i],
    ['over several dates', { endDate: 'NEXT' }, /same date/],
    ['a session on a full-day request', { duration: 'FULL_DAY', halfDaySession: 'MORNING' }, /only be chosen for a half-day/],
  ])('rejects a half day %s', async (_, override, message) => {
    const { token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    const body = { leaveType: LEAVE_TYPE.PAID, startDate: at(0, 10), endDate: at(0, 10), duration: 'HALF_DAY', halfDaySession: 'MORNING', ...override };
    if (override.endDate === 'NEXT') body.endDate = at(0, 11);
    const res = await submit(token, body);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(message);
    expect(await Leave.countDocuments({})).toBe(0);
  });

  test('a client-sent day count or balance is ignored; the server computes 0.5', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    const res = await half(token, LEAVE_TYPE.CASUAL, at(0, 10), 'MORNING', { days: 0.01, available: 99, employeeId: '64b000000000000000000000', status: 'APPROVED' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ days: 0.5, status: 'PENDING' });
  });
});

describe('Casual balance with half days', () => {
  test('pending half days reserve 0.5 each; insufficient balance is refused', async () => {
    const { employee, token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    await keepCasual(employee._id, 1);
    expect((await half(token, LEAVE_TYPE.CASUAL, at(0, 10), 'MORNING')).status).toBe(201);
    expect(await available(employee)).toBe(0.5);
    const tooMuch = await full(token, LEAVE_TYPE.CASUAL, at(0, 12));
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.details).toMatchObject({ available: 0.5, requested: 1, shortfall: 0.5 });
    expect((await half(token, LEAVE_TYPE.CASUAL, at(0, 12), 'EVENING')).status).toBe(201);
    expect(await available(employee)).toBe(0);
    expect((await half(token, LEAVE_TYPE.CASUAL, at(0, 14), 'MORNING')).status).toBe(400);
    expect(await Leave.countDocuments({ leaveType: LEAVE_TYPE.PAID })).toBe(0); // never converted
  });

  test('approval keeps the 0.5 spent; rejection and cancellation release it', async () => {
    const emp = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    const adm = await setup(ROLES.ADMIN, 'hr@zorx.test');
    await keepCasual(emp.employee._id, 2);
    const a = (await half(emp.token, LEAVE_TYPE.CASUAL, at(0, 10), 'MORNING')).body.data;
    const b = (await half(emp.token, LEAVE_TYPE.CASUAL, at(0, 11), 'EVENING')).body.data;
    const c = (await half(emp.token, LEAVE_TYPE.CASUAL, at(0, 12), 'MORNING')).body.data;
    expect(await available(emp.employee)).toBe(0.5);
    expect((await request(app).patch(`/api/leaves/${a._id}/approve`).set(auth(adm.token)).send({})).status).toBe(200);
    expect(await available(emp.employee)).toBe(0.5);
    await request(app).patch(`/api/leaves/${b._id}/reject`).set(auth(adm.token)).send({});
    expect(await available(emp.employee)).toBe(1);
    await request(app).patch(`/api/leaves/${c._id}/cancel`).set(auth(emp.token));
    expect(await available(emp.employee)).toBe(1.5);
  });

  test('many half days add up exactly (no floating-point drift)', async () => {
    const { employee, token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    await keepCasual(employee._id, 2);
    for (const [d, s] of [[3, 'MORNING'], [3, 'EVENING'], [4, 'MORNING'], [5, 'EVENING']]) expect((await half(token, LEAVE_TYPE.CASUAL, at(0, d), s)).status).toBe(201);
    expect(await available(employee)).toBe(0);
    expect((await half(token, LEAVE_TYPE.CASUAL, at(0, 6), 'MORNING')).status).toBe(400);
  });
});

describe('same-date rules', () => {
  test('Morning + Evening of one date are allowed (even different types); a repeated session or a full day is not', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    expect((await half(token, LEAVE_TYPE.CASUAL, at(0, 10), 'MORNING')).status).toBe(201);
    const same = await half(token, LEAVE_TYPE.PAID, at(0, 10), 'MORNING');
    expect(same.status).toBe(400);
    expect(same.body.message).toMatch(/already have a half-day leave for this session/);
    expect((await full(token, LEAVE_TYPE.PAID, at(0, 10))).status).toBe(400);
    expect((await half(token, LEAVE_TYPE.PAID, at(0, 10), 'EVENING')).status).toBe(201);
    expect((await half(token, LEAVE_TYPE.PAID, at(0, 10), 'EVENING')).status).toBe(400);
  });

  test('a half day cannot be added inside an existing full-day leave', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    expect((await full(token, LEAVE_TYPE.PAID, at(0, 10), at(0, 12))).status).toBe(201);
    expect((await half(token, LEAVE_TYPE.PAID, at(0, 11), 'EVENING')).status).toBe(400);
  });
});

describe('Sick and Paid rules unchanged', () => {
  test('Sick: two half days fill the 1-day monthly allowance; a third is refused', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    expect((await half(token, LEAVE_TYPE.SICK, at(0, 10), 'MORNING')).status).toBe(201);
    expect((await half(token, LEAVE_TYPE.SICK, at(0, 12), 'EVENING')).status).toBe(201);
    expect((await half(token, LEAVE_TYPE.SICK, at(0, 14), 'MORNING')).status).toBe(400);
  });

  test('Sick eligibility still applies to half days', async () => {
    const recent = new Date(Date.now() - 5 * 86400000);
    const { token } = await setup(ROLES.EMPLOYEE, 'new@zorx.test', recent);
    const res = await half(token, LEAVE_TYPE.SICK, new Date(recent.getTime() + 20 * 86400000).toISOString().slice(0, 10), 'MORNING');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/3 months after joining/);
  });

  test('Paid half days have no allowance, as before', async () => {
    const { token } = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    for (const d of [10, 11, 12]) expect((await half(token, LEAVE_TYPE.PAID, at(0, d), 'MORNING')).status).toBe(201);
  });
});

describe('older records and reviewers', () => {
  test('records without a duration behave as full day and are not rewritten when changed', async () => {
    const emp = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    const old = await Leave.collection.insertOne({ employeeId: emp.employee._id, leaveType: 'PAID', startDate: new Date(at(0, 10)), endDate: new Date(at(0, 10)), days: 1, reason: 'Old', status: 'PENDING', createdAt: new Date(), updatedAt: new Date() });
    // A full day already covers that date, so even a half day overlaps it.
    expect((await half(emp.token, LEAVE_TYPE.PAID, at(0, 10), 'MORNING')).status).toBe(400);
    const mine = await request(app).get('/api/leaves/me').set(auth(emp.token));
    expect(mine.body.data.leaves[0].duration).toBeUndefined(); // UI treats missing as Full Day
    await request(app).patch(`/api/leaves/${old.insertedId}/cancel`).set(auth(emp.token));
    const raw = await Leave.collection.findOne({ _id: old.insertedId });
    expect(raw.status).toBe('CANCELLED');
    expect('duration' in raw).toBe(false);
    expect('halfDaySession' in raw).toBe(false);
  });

  test('HR/Admin see the duration and session in the review list', async () => {
    const emp = await setup(ROLES.EMPLOYEE, 'a@zorx.test');
    const adm = await setup(ROLES.ADMIN, 'hr@zorx.test');
    await half(emp.token, LEAVE_TYPE.PAID, at(0, 10), 'EVENING');
    const list = await request(app).get('/api/leaves').set(auth(adm.token));
    expect(list.body.data[0]).toMatchObject({ duration: 'HALF_DAY', halfDaySession: 'EVENING', days: 0.5 });
  });
});
