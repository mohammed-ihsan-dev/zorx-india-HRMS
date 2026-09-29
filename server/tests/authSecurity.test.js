import jwt from 'jsonwebtoken';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { env } from '../src/config/env.js';
import { ROLES, USER_STATUS } from '../src/utils/constants.js';

const app = createApp();
const REAL_PASSWORD = 'CorrectHorseBattery9';

// The exact strings that were previously hardcoded as universal bypasses in
// authController.js — none of these is any test user's real password.
const FORMER_BYPASS_PASSWORDS = ['88888888', '1234', 'Password', 'Zorx@Dev123'];

async function createUser(email, { role = ROLES.EMPLOYEE, status = USER_STATUS.ACTIVE, mustChangePassword = false } = {}) {
  const passwordHash = await User.hashPassword(REAL_PASSWORD);
  const user = await User.create({ email, passwordHash, role, status, mustChangePassword });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`,
    firstName: 'Test',
    lastName: 'User',
    joiningDate: new Date('2025-01-01'),
  });
  user.employeeId = employee._id;
  await user.save();
  return user;
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

describe('login — no authentication bypass', () => {
  test('the correct password logs in successfully', async () => {
    await createUser('correct@zorx.test');
    const res = await request(app).post('/api/auth/login').send({ email: 'correct@zorx.test', password: REAL_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  test('an incorrect password is rejected', async () => {
    await createUser('wrongpass@zorx.test');
    const res = await request(app).post('/api/auth/login').send({ email: 'wrongpass@zorx.test', password: 'totally-wrong' });
    expect(res.status).toBe(401);
  });

  test.each(FORMER_BYPASS_PASSWORDS)('the former hardcoded bypass password %j no longer authenticates', async (bypassPassword) => {
    await createUser('nobypass@zorx.test');
    const res = await request(app).post('/api/auth/login').send({ email: 'nobypass@zorx.test', password: bypassPassword });
    expect(res.status).toBe(401);
  });

  test.each(FORMER_BYPASS_PASSWORDS)('bypass password %j cannot authenticate as a different (e.g. admin) account either', async (bypassPassword) => {
    await createUser('victim-admin@zorx.test', { role: ROLES.SUPER_ADMIN });
    const res = await request(app).post('/api/auth/login').send({ email: 'victim-admin@zorx.test', password: bypassPassword });
    expect(res.status).toBe(401);
  });

  test('an inactive user cannot authenticate even with the correct password', async () => {
    await createUser('inactive@zorx.test', { status: USER_STATUS.SUSPENDED });
    const res = await request(app).post('/api/auth/login').send({ email: 'inactive@zorx.test', password: REAL_PASSWORD });
    expect(res.status).toBe(403);
  });

  test('a nonexistent user cannot authenticate', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@zorx.test', password: REAL_PASSWORD });
    expect(res.status).toBe(401);
  });
});

describe('password hashing and JWT still function correctly', () => {
  test('hashPassword/comparePassword round-trip via bcrypt', async () => {
    const user = await createUser('hash-check@zorx.test');
    const stored = await User.findById(user._id).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/); // real bcrypt hash, not plaintext
    expect(await stored.comparePassword(REAL_PASSWORD)).toBe(true);
    expect(await stored.comparePassword('anything-else')).toBe(false);
  });

  test('a successful login issues a valid, verifiable JWT for the correct user', async () => {
    const user = await createUser('jwt-check@zorx.test');
    const res = await request(app).post('/api/auth/login').send({ email: 'jwt-check@zorx.test', password: REAL_PASSWORD });
    expect(res.status).toBe(200);

    const payload = jwt.verify(res.body.data.token, env.jwtSecret);
    expect(payload.sub).toBe(user._id.toString());
    expect(payload.role).toBe(ROLES.EMPLOYEE);
  });
});

describe('forced password-change flow still works, without reopening the bypass', () => {
  test('a mustChangePassword user can set a new password without a currentPassword', async () => {
    const user = await createUser('force-change@zorx.test', { mustChangePassword: true });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'force-change@zorx.test', password: REAL_PASSWORD });
    expect(loginRes.body.data.user.mustChangePassword).toBe(true);
    const token = loginRes.body.data.token;

    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'BrandNewPassword1' });
    expect(changeRes.status).toBe(200);

    const updated = await User.findById(user._id).select('+passwordHash');
    expect(updated.mustChangePassword).toBe(false);
    expect(await updated.comparePassword('BrandNewPassword1')).toBe(true);

    const reLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'force-change@zorx.test', password: 'BrandNewPassword1' });
    expect(reLoginRes.status).toBe(200);
  });

  test('a mustChangePassword user supplying a wrong currentPassword is rejected, not bypassed', async () => {
    await createUser('force-change2@zorx.test', { mustChangePassword: true });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'force-change2@zorx.test', password: REAL_PASSWORD });
    const token = loginRes.body.data.token;

    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Password', newPassword: 'BrandNewPassword1' }); // former bypass value
    expect(changeRes.status).toBe(400);
  });

  test('a normal user must supply their real current password to change it', async () => {
    const user = await createUser('normal-change@zorx.test');
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'normal-change@zorx.test', password: REAL_PASSWORD });
    const token = loginRes.body.data.token;

    const wrongRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: '1234', newPassword: 'BrandNewPassword1' }); // former bypass value
    expect(wrongRes.status).toBe(400);

    const correctRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: REAL_PASSWORD, newPassword: 'BrandNewPassword1' });
    expect(correctRes.status).toBe(200);

    const updated = await User.findById(user._id).select('+passwordHash');
    expect(await updated.comparePassword('BrandNewPassword1')).toBe(true);
  });
});
