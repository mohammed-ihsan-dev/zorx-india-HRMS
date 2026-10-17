import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { PasswordResetToken } from '../src/models/PasswordResetToken.js';
import { setMailTransportForTests } from '../src/services/mailService.js';
import { ROLES, USER_STATUS } from '../src/utils/constants.js';

const app = createApp();
const OLD_PASSWORD = 'OldPass@123';
const NEW_PASSWORD = 'NewPass@456';
let sent;

const waitFor = async (cond, ms = 3000) => {
  const until = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > until) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const settle = () => new Promise((r) => setTimeout(r, 150));

async function createUser(email, status = USER_STATUS.ACTIVE) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(OLD_PASSWORD), role: ROLES.EMPLOYEE, status, mustChangePassword: true });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: 'Reset', lastName: 'Test', joiningDate: new Date('2025-01-01') });
  user.employeeId = employee._id;
  await user.save();
  return user;
}
const forgot = (email) => request(app).post('/api/auth/forgot-password').send({ email });
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const reset = (token, newPassword = NEW_PASSWORD, confirmPassword = newPassword) =>
  request(app).post('/api/auth/reset-password').send({ token, newPassword, confirmPassword });
const tokenFromMail = (mail) => /reset-password\?token=([a-f0-9]{64})/.exec(mail.text)[1];

async function requestToken(email) {
  const before = sent.length;
  await forgot(email);
  await waitFor(() => sent.length > before);
  return tokenFromMail(sent[sent.length - 1]);
}

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  setMailTransportForTests(null);
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  sent = [];
  setMailTransportForTests({ sendMail: async (msg) => { sent.push(msg); } });
});

describe('POST /api/auth/forgot-password', () => {
  test('an active account gets one email with a 30-minute single-use link; only a hash is stored', async () => {
    await createUser('emp@zorx.test');
    const res = await forgot('emp@zorx.test');
    expect(res.status).toBe(200);
    await waitFor(() => sent.length === 1);

    const mail = sent[0];
    expect(mail.to).toBe('emp@zorx.test');
    expect(mail.text).toContain(`${env.appUrl}/reset-password?token=`);
    const token = tokenFromMail(mail);
    const stored = await PasswordResetToken.findOne({});
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const minutes = (stored.expiresAt - stored.createdAt) / 60000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  test('unknown, inactive and pending emails get the identical reply and no email', async () => {
    await createUser('known@zorx.test');
    await createUser('inactive@zorx.test', USER_STATUS.INACTIVE);
    await createUser('pending@zorx.test', USER_STATUS.PENDING_APPROVAL);
    const known = await forgot('known@zorx.test');
    await waitFor(() => sent.length === 1);

    for (const email of ['nobody@zorx.test', 'inactive@zorx.test', 'pending@zorx.test']) {
      const res = await forgot(email);
      expect(res.status).toBe(known.status);
      expect(res.body).toEqual(known.body);
    }
    await settle();
    expect(sent).toHaveLength(1);
    expect(await PasswordResetToken.countDocuments({})).toBe(1);
  });

  test('email matching ignores case and surrounding spaces', async () => {
    await createUser('emp@zorx.test');
    await forgot('  EMP@Zorx.Test ');
    await waitFor(() => sent.length === 1);
  });

  test('a new request cancels the previous link', async () => {
    await createUser('emp@zorx.test');
    const first = await requestToken('emp@zorx.test');
    const second = await requestToken('emp@zorx.test');
    expect(first).not.toBe(second);
    expect((await reset(first)).status).toBe(400);
    expect((await reset(second)).status).toBe(200);
  });

  test('still answers normally when email sending is not configured', async () => {
    setMailTransportForTests(null);
    await createUser('emp@zorx.test');
    const res = await forgot('emp@zorx.test');
    expect(res.status).toBe(200);
  });

  test('rejects a malformed email', async () => {
    expect((await forgot('not-an-email')).status).toBe(400);
  });
});

describe('verify and reset', () => {
  test('a valid link verifies; bad links return 400 (never 401)', async () => {
    await createUser('emp@zorx.test');
    const token = await requestToken('emp@zorx.test');
    expect((await request(app).post('/api/auth/reset-password/verify').send({ token })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password/verify').send({ token: 'a'.repeat(64) })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password/verify').send({ token: 'garbage' })).status).toBe(400);
  });

  test('resetting sets the new password, clears the forced-change flag and old password stops working', async () => {
    await createUser('emp@zorx.test');
    const token = await requestToken('emp@zorx.test');
    const res = await reset(token);
    expect(res.status).toBe(200);
    expect((await login('emp@zorx.test', OLD_PASSWORD)).status).toBe(401);
    const ok = await login('emp@zorx.test', NEW_PASSWORD);
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.mustChangePassword).toBe(false);
  });

  test('a link works only once', async () => {
    await createUser('emp@zorx.test');
    const token = await requestToken('emp@zorx.test');
    expect((await reset(token)).status).toBe(200);
    expect((await reset(token, 'Another@789')).status).toBe(400);
  });

  test('an expired link is refused', async () => {
    await createUser('emp@zorx.test');
    const token = await requestToken('emp@zorx.test');
    await PasswordResetToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(token)).status).toBe(400);
    expect((await login('emp@zorx.test', OLD_PASSWORD)).status).toBe(200);
  });

  test('a link for an account deactivated after the request is refused', async () => {
    const user = await createUser('emp@zorx.test');
    const token = await requestToken('emp@zorx.test');
    await User.updateOne({ _id: user._id }, { $set: { status: USER_STATUS.INACTIVE } });
    expect((await reset(token)).status).toBe(400);
  });

  test('mismatched or short passwords are rejected and the link stays usable', async () => {
    await createUser('emp@zorx.test');
    const token = await requestToken('emp@zorx.test');
    expect((await reset(token, NEW_PASSWORD, 'Different@1')).status).toBe(400);
    expect((await reset(token, 'short', 'short')).status).toBe(400);
    expect((await reset(token)).status).toBe(200);
  });

  test('two simultaneous submissions of the same link: exactly one succeeds', async () => {
    await createUser('emp@zorx.test');
    const token = await requestToken('emp@zorx.test');
    const results = await Promise.all([reset(token, 'FirstPass@1'), reset(token, 'SecondPass@2')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});

describe('sessions after a reset', () => {
  test('sessions issued before the reset are signed out; a fresh login works immediately', async () => {
    await createUser('emp@zorx.test');
    const oldSession = (await login('emp@zorx.test', OLD_PASSWORD)).body.data.token;
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldSession}`)).status).toBe(200);

    // Ensure the reset happens in a later second than the old token's iat.
    await new Promise((r) => setTimeout(r, 1100));
    const token = await requestToken('emp@zorx.test');
    await reset(token);

    const stale = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldSession}`);
    expect(stale.status).toBe(401);
    expect(stale.body.message).toMatch(/password was reset/);

    const fresh = (await login('emp@zorx.test', NEW_PASSWORD)).body.data.token;
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${fresh}`)).status).toBe(200);
  });

  test('users who never reset are unaffected (passwordChangedAt stays null)', async () => {
    const user = await createUser('emp@zorx.test');
    const session = (await login('emp@zorx.test', OLD_PASSWORD)).body.data.token;
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${session}`)).status).toBe(200);
    expect((await User.findById(user._id)).passwordChangedAt).toBeNull();
  });
});
