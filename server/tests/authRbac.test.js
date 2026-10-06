import jwt from 'jsonwebtoken';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { env } from '../src/config/env.js';
import { ROLES, USER_STATUS } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';

async function createUser(role, email) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`,
    firstName: role,
    lastName: 'Test',
    joiningDate: new Date('2025-01-01'),
  });
  user.employeeId = employee._id;
  await user.save();
  return user;
}

async function loginAs(role, email) {
  const user = await createUser(role, email);
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { user, res, token: res.body.data?.token };
}

const get = (path, token) => request(app).get(path).set('Authorization', `Bearer ${token}`);

// Back-office-only endpoints across modules.
const ADMIN_ONLY_GETS = [
  '/api/employees',
  '/api/attendance',
  '/api/leaves',
  '/api/work-from-home',
  '/api/work-from-home/summary',
  '/api/dashboard/admin',
  '/api/edit-requests',
];

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('login and /auth/me report the stored role', () => {
  test.each([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.EMPLOYEE])('%s login and /me both return that same role', async (role) => {
    const { res, token } = await loginAs(role, `${role.toLowerCase()}@zorx.test`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe(role);

    const me = await get('/api/auth/me', token);
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe(role);
  });
});

describe('token validation', () => {
  test('missing token → 401', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  test('malformed Authorization header → 401', async () => {
    const { token } = await loginAs(ROLES.ADMIN, 'admin@zorx.test');
    expect((await request(app).get('/api/auth/me').set('Authorization', token)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
  });

  test('token signed with a different secret → 401', async () => {
    const user = await createUser(ROLES.ADMIN, 'admin@zorx.test');
    const forged = jwt.sign({ sub: user._id.toString(), role: ROLES.ADMIN }, 'some-other-secret', { expiresIn: '1h' });
    expect((await get('/api/auth/me', forged)).status).toBe(401);
  });

  test('expired token → 401 with the session-expired message', async () => {
    const user = await createUser(ROLES.ADMIN, 'admin@zorx.test');
    const expired = jwt.sign({ sub: user._id.toString(), role: ROLES.ADMIN }, env.jwtSecret, { expiresIn: -10 });
    const res = await get('/api/auth/me', expired);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('a valid token for a user who no longer exists → 401', async () => {
    const { user, token } = await loginAs(ROLES.ADMIN, 'admin@zorx.test');
    await User.deleteOne({ _id: user._id });
    expect((await get('/api/auth/me', token)).status).toBe(401);
  });

  test('a valid token for a user deactivated after login → rejected', async () => {
    const { user, token } = await loginAs(ROLES.ADMIN, 'admin@zorx.test');
    await User.updateOne({ _id: user._id }, { $set: { status: USER_STATUS.INACTIVE } });
    expect((await get('/api/employees', token)).status).toBe(403);
  });
});

describe('role always comes from the database, never from the token or request', () => {
  test('an employee token whose role claim is tampered to ADMIN is still treated as EMPLOYEE', async () => {
    const employee = await createUser(ROLES.EMPLOYEE, 'emp@zorx.test');
    // Correctly signed, but with a lying role claim.
    const tampered = jwt.sign({ sub: employee._id.toString(), role: ROLES.ADMIN }, env.jwtSecret, { expiresIn: '1h' });

    expect((await get('/api/auth/me', tampered)).body.data.role).toBe(ROLES.EMPLOYEE);
    expect((await get('/api/employees', tampered)).status).toBe(403);
  });

  test('an admin token keeps ADMIN even if its role claim says EMPLOYEE', async () => {
    const admin = await createUser(ROLES.ADMIN, 'admin@zorx.test');
    const token = jwt.sign({ sub: admin._id.toString(), role: ROLES.EMPLOYEE }, env.jwtSecret, { expiresIn: '1h' });
    expect((await get('/api/auth/me', token)).body.data.role).toBe(ROLES.ADMIN);
    expect((await get('/api/employees', token)).status).toBe(200);
  });

  test('a role change in the database takes effect on the very next request', async () => {
    const { user, token } = await loginAs(ROLES.EMPLOYEE, 'promoted@zorx.test');
    expect((await get('/api/employees', token)).status).toBe(403);
    await User.updateOne({ _id: user._id }, { $set: { role: ROLES.ADMIN } });
    expect((await get('/api/employees', token)).status).toBe(200);
  });

  test('role or permissions sent in the query or body are ignored', async () => {
    const { token } = await loginAs(ROLES.EMPLOYEE, 'emp@zorx.test');
    expect((await get('/api/employees?role=ADMIN', token)).status).toBe(403);
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN', permissions: ['CONTENT_CALENDAR_MANAGE'], email: 'x@zorx.test', password: 'Password1', firstName: 'X', joiningDate: '2026-01-01' });
    expect(res.status).toBe(403);
    expect(await User.countDocuments({ email: 'x@zorx.test' })).toBe(0);
  });
});

describe('back-office API access', () => {
  test.each(ADMIN_ONLY_GETS)('EMPLOYEE gets 403 on %s', async (path) => {
    const { token } = await loginAs(ROLES.EMPLOYEE, 'emp@zorx.test');
    expect((await get(path, token)).status).toBe(403);
  });

  test.each(ADMIN_ONLY_GETS)('ADMIN gets 200 on %s', async (path) => {
    const { token } = await loginAs(ROLES.ADMIN, 'admin@zorx.test');
    expect((await get(path, token)).status).toBe(200);
  });

  test.each(ADMIN_ONLY_GETS)('SUPER_ADMIN gets 200 on %s', async (path) => {
    const { token } = await loginAs(ROLES.SUPER_ADMIN, 'super@zorx.test');
    expect((await get(path, token)).status).toBe(200);
  });

  test('an employee token never unlocks admin APIs after an admin has logged in elsewhere', async () => {
    const admin = await loginAs(ROLES.ADMIN, 'admin@zorx.test');
    const emp = await loginAs(ROLES.EMPLOYEE, 'emp@zorx.test');
    expect((await get('/api/employees', admin.token)).status).toBe(200);
    expect((await get('/api/employees', emp.token)).status).toBe(403);
    expect((await get('/api/auth/me', admin.token)).body.data.role).toBe(ROLES.ADMIN);
  });
});
