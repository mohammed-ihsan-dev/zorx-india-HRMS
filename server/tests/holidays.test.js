import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Holiday } from '../src/models/Holiday.js';
import { Attendance } from '../src/models/Attendance.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { getStartOfDayUTC } from '../src/utils/dateUtils.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';

async function setup(role, email) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: email.split('@')[0], lastName: 'Test', joiningDate: new Date('2024-01-15') });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const add = (token, date, name = 'Company Holiday') => request(app).post('/api/holidays').set(auth(token)).send({ date, name });

beforeAll(async () => {
  await startTestDb();
});
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
});

describe('managing holidays', () => {
  test('admin adds a holiday; it is stored as that calendar day and audited', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const res = await add(admin.token, '2026-10-19');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ date: '2026-10-19T00:00:00.000Z', name: 'Company Holiday' });
    expect((await AuditLog.findOne({ action: 'HOLIDAY_CREATED' })).description).toBe('Marked 19 Oct 2026 as a holiday (Company Holiday)');
  });

  test('a date can only be a holiday once', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    await add(admin.token, '2026-10-19');
    expect((await add(admin.token, '2026-10-19', 'Again')).status).toBe(409);
    expect(await Holiday.countDocuments({})).toBe(1);
  });

  test.each([
    ['an impossible date', { date: '2026-02-31', name: 'X Day' }],
    ['a malformed date', { date: '19/10/2026', name: 'X Day' }],
    ['a missing name', { date: '2026-10-19', name: ' ' }],
  ])('rejects %s', async (_, body) => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    expect((await request(app).post('/api/holidays').set(auth(admin.token)).send(body)).status).toBe(400);
    expect(await Holiday.countDocuments({})).toBe(0);
  });

  test('employees can list holidays but cannot add or remove them', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const id = (await add(admin.token, '2026-10-19')).body.data._id;
    expect((await add(emp.token, '2026-11-01')).status).toBe(403);
    expect((await request(app).delete(`/api/holidays/${id}`).set(auth(emp.token))).status).toBe(403);
    const list = await request(app).get('/api/holidays').set(auth(emp.token));
    expect(list.status).toBe(200);
    expect(list.body.data.map((h) => h.name)).toEqual(['Company Holiday']);
    expect((await request(app).get('/api/holidays')).status).toBe(401);
  });

  test('lists by date range, oldest first', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    await add(admin.token, '2026-11-14', 'Day B');
    await add(admin.token, '2026-10-19', 'Day A');
    await add(admin.token, '2026-12-25', 'Day C');
    const res = await request(app).get('/api/holidays').set(auth(admin.token)).query({ from: '2026-10-01', to: '2026-11-30' });
    expect(res.body.data.map((h) => h.name)).toEqual(['Day A', 'Day B']);
    expect((await request(app).get('/api/holidays').set(auth(admin.token)).query({ from: 'oct' })).status).toBe(400);
  });

  test('removing a holiday never touches attendance records', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const day = new Date('2026-10-19T00:00:00.000Z');
    await Attendance.create({ employeeId: admin.employee._id, date: day, checkIn: { timestamp: new Date('2026-10-19T04:00:00Z') }, status: 'PRESENT' });
    const before = await Attendance.find({}).lean();
    const id = (await add(admin.token, '2026-10-19')).body.data._id;
    expect((await request(app).delete(`/api/holidays/${id}`).set(auth(admin.token))).status).toBe(200);
    expect(await Holiday.countDocuments({})).toBe(0);
    expect(await Attendance.find({}).lean()).toEqual(before);
    expect((await request(app).delete('/api/holidays/not-an-id').set(auth(admin.token))).status).toBe(404);
    expect(await AuditLog.countDocuments({ action: 'HOLIDAY_DELETED' })).toBe(1);
  });
});

describe('admin dashboard', () => {
  test('nobody is counted absent on a holiday; normal days are unchanged', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const dash = async () => (await request(app).get('/api/dashboard/admin').set(auth(admin.token))).body.data;

    const normal = await dash();
    expect(normal.absent).toBe(2);
    expect(normal.holidayToday).toBeNull();

    await Holiday.create({ date: getStartOfDayUTC(new Date()), name: 'Festival', createdBy: admin.user._id });
    const holiday = await dash();
    expect(holiday.absent).toBe(0);
    expect(holiday.holidayToday).toBe('Festival');
  });
});
