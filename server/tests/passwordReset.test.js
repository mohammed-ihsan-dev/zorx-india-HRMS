import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { PasswordResetOtp } from '../src/models/PasswordResetOtp.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { setMailTransportForTests } from '../src/services/mailService.js';
import { generateOtp, OTP_MAX_ATTEMPTS } from '../src/services/passwordResetService.js';
import { ROLES, USER_STATUS } from '../src/utils/constants.js';

const app = createApp();
const OLD_PASSWORD = 'OldPass@123';
const NEW_PASSWORD = 'NewPass@456';
const EMAIL = 'emp@zorx.test';
let sent;
let failSending;

const waitFor = async (cond, ms = 3000) => {
  const until = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > until) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const settle = () => new Promise((r) => setTimeout(r, 200));

async function createUser(email = EMAIL, status = USER_STATUS.ACTIVE) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(OLD_PASSWORD), role: ROLES.EMPLOYEE, status, mustChangePassword: true });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: 'Reset', lastName: 'Test', joiningDate: new Date('2025-01-01') });
  user.employeeId = employee._id;
  await user.save();
  return user;
}
const forgot = (email = EMAIL) => request(app).post('/api/auth/forgot-password').send({ email });
const verify = (otp, email = EMAIL) => request(app).post('/api/auth/forgot-password/verify-otp').send({ email, otp });
const reset = (resetToken, newPassword = NEW_PASSWORD, confirmPassword = newPassword) =>
  request(app).post('/api/auth/reset-password').send({ resetToken, newPassword, confirmPassword });
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const otpFromMail = (mail) => /code is: (\d{6})/.exec(mail.text)[1];
const wrongOtp = (otp) => String((Number(otp) + 1) % 1_000_000).padStart(6, '0');
// Moves the resend cooldown out of the way without waiting 60s.
const skipCooldown = () => PasswordResetOtp.updateMany({}, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });

async function requestOtp(email = EMAIL) {
  const before = sent.length;
  await forgot(email);
  await waitFor(() => sent.length > before);
  return otpFromMail(sent[sent.length - 1]);
}
async function getResetToken() {
  const otp = await requestOtp();
  return (await verify(otp)).body.data.resetToken;
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
  failSending = false;
  setMailTransportForTests({
    sendMail: async (msg) => {
      if (failSending) throw new Error('SMTP unavailable');
      sent.push(msg);
    },
  });
});

describe('OTP generation', () => {
  test('always exactly 6 digits, spread across the full range', () => {
    const samples = Array.from({ length: 5000 }, generateOtp);
    expect(samples.every((o) => /^\d{6}$/.test(o))).toBe(true);
    expect(new Set(samples).size).toBeGreaterThan(4900);
    expect(samples.some((o) => o.startsWith('0'))).toBe(true); // leading zeros are valid codes
  });
});

describe('POST /api/auth/forgot-password', () => {
  test('emails a 6-digit OTP to the registered address; only a keyed digest is stored', async () => {
    await createUser();
    const res = await forgot();
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If an account exists for this email address, an OTP will be sent.');
    expect(res.body.data).toEqual({ expiresInMinutes: 10, resendAfterSeconds: 60 });
    await waitFor(() => sent.length === 1);

    const otp = otpFromMail(sent[0]);
    expect(sent[0].to).toBe(EMAIL);
    expect(sent[0].text).toMatch(/expires in 10 minutes/);
    expect(sent[0].text).toMatch(/Do not share this code/);
    expect(sent[0].html).toContain('ZORX INDIA');
    const record = await PasswordResetOtp.findOne({});
    expect(JSON.stringify(record.toObject())).not.toContain(otp);
    expect(record.otpDigest).toMatch(/^[a-f0-9]{64}$/);
    const minutes = (record.expiresAt - record.lastSentAt) / 60000;
    expect(minutes).toBe(10);
    expect(JSON.stringify(res.body)).not.toContain(otp);
  });

  test('unknown, inactive and pending emails get the identical reply and no email', async () => {
    await createUser();
    await createUser('inactive@zorx.test', USER_STATUS.INACTIVE);
    await createUser('pending@zorx.test', USER_STATUS.PENDING_APPROVAL);
    const known = await forgot();
    await waitFor(() => sent.length === 1);
    for (const email of ['nobody@zorx.test', 'inactive@zorx.test', 'pending@zorx.test']) {
      const res = await forgot(email);
      expect(res.status).toBe(known.status);
      expect(res.body).toEqual(known.body);
    }
    await settle();
    expect(sent).toHaveLength(1);
  });

  test('the OTP is sent to the stored email, not the client-supplied spelling', async () => {
    await createUser();
    await forgot('  EMP@Zorx.Test ');
    await waitFor(() => sent.length === 1);
    expect(sent[0].to).toBe(EMAIL);
  });

  test('resend cooldown: a second request within 60 seconds sends nothing', async () => {
    await createUser();
    await requestOtp();
    await forgot();
    await settle();
    expect(sent).toHaveLength(1);
    await skipCooldown();
    await requestOtp();
    expect(sent).toHaveLength(2);
  });

  test('a new OTP invalidates the previous one', async () => {
    await createUser();
    const first = await requestOtp();
    await skipCooldown();
    const second = await requestOtp();
    if (first !== second) expect((await verify(first)).status).toBe(400);
    expect((await verify(second)).status).toBe(200);
  });

  test('at most 5 OTPs per account per hour', async () => {
    await createUser();
    for (let i = 0; i < 5; i += 1) {
      await requestOtp();
      await skipCooldown();
    }
    await forgot();
    await settle();
    expect(sent).toHaveLength(5);
  });

  test('simultaneous requests issue only one live OTP', async () => {
    await createUser();
    await Promise.all([forgot(), forgot(), forgot()]);
    await settle();
    expect(sent).toHaveLength(1);
    expect(await PasswordResetOtp.countDocuments({})).toBe(1);
  });

  test('if the email fails to send, the endpoint still answers normally and the user can retry at once', async () => {
    await createUser();
    failSending = true;
    expect((await forgot()).status).toBe(200);
    await waitFor(async () => (await PasswordResetOtp.countDocuments({})) === 0);
    failSending = false;
    await requestOtp();
    expect(sent).toHaveLength(1);
  });

  test('rejects a malformed email', async () => {
    expect((await forgot('not-an-email')).status).toBe(400);
  });
});

describe('POST /api/auth/forgot-password/verify-otp', () => {
  test('a correct OTP returns a reset authorization', async () => {
    await createUser();
    const otp = await requestOtp();
    const res = await verify(otp);
    expect(res.status).toBe(200);
    expect(res.body.data.resetToken).toMatch(/^[a-f0-9]{64}$/);
  });

  test('wrong codes, unknown emails and malformed codes all fail the same way', async () => {
    await createUser();
    const otp = await requestOtp();
    const wrong = await verify(wrongOtp(otp));
    const unknown = await verify(otp, 'nobody@zorx.test');
    expect(wrong.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toBe(wrong.body.message);
    expect((await verify('12ab56')).status).toBe(400);
  });

  test(`after ${OTP_MAX_ATTEMPTS} wrong attempts even the correct code is refused`, async () => {
    await createUser();
    const otp = await requestOtp();
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) expect((await verify(wrongOtp(otp))).status).toBe(400);
    expect((await verify(otp)).status).toBe(400);
  });

  test('concurrent guesses cannot exceed the attempt limit', async () => {
    await createUser();
    const otp = await requestOtp();
    await Promise.all(Array.from({ length: 12 }, () => verify(wrongOtp(otp))));
    expect((await PasswordResetOtp.findOne({})).attempts).toBe(OTP_MAX_ATTEMPTS);
    expect((await verify(otp)).status).toBe(400);
  });

  test('an expired OTP is refused', async () => {
    await createUser();
    const otp = await requestOtp();
    await PasswordResetOtp.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await verify(otp)).status).toBe(400);
  });

  test('an OTP is single use, even when submitted twice at the same moment', async () => {
    await createUser();
    const otp = await requestOtp();
    const results = await Promise.all([verify(otp), verify(otp)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await verify(otp)).status).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  test('verify → reset sets the new password, clears forced-change and records an audit entry', async () => {
    await createUser();
    const token = await getResetToken();
    expect((await reset(token)).status).toBe(200);
    expect((await login(EMAIL, OLD_PASSWORD)).status).toBe(401);
    const ok = await login(EMAIL, NEW_PASSWORD);
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.mustChangePassword).toBe(false);
    expect(await AuditLog.countDocuments({ action: 'PASSWORD_RESET' })).toBe(1);
    expect(await PasswordResetOtp.countDocuments({})).toBe(0);
  });

  test('the reset authorization works once, even with simultaneous submissions', async () => {
    await createUser();
    const token = await getResetToken();
    const results = await Promise.all([reset(token, 'FirstPass@1'), reset(token, 'SecondPass@2')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await reset(token, 'ThirdPass@3')).status).toBe(400);
  });

  test('an expired reset authorization is refused', async () => {
    await createUser();
    const token = await getResetToken();
    await PasswordResetOtp.updateMany({}, { $set: { resetExpiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(token)).status).toBe(400);
  });

  test('a made-up reset authorization is refused, and the step cannot be reached without verifying', async () => {
    await createUser();
    await requestOtp();
    expect((await reset('a'.repeat(64))).status).toBe(400);
    expect((await reset('not-a-token')).status).toBe(400);
    expect((await login(EMAIL, OLD_PASSWORD)).status).toBe(200);
  });

  test('requesting a new OTP cancels an unused reset authorization', async () => {
    await createUser();
    const token = await getResetToken();
    await skipCooldown();
    await requestOtp();
    expect((await reset(token)).status).toBe(400);
  });

  test('password policy: too short or mismatched is refused and the authorization stays usable', async () => {
    await createUser();
    const token = await getResetToken();
    expect((await reset(token, 'short', 'short')).status).toBe(400);
    expect((await reset(token, NEW_PASSWORD, 'Different@1')).status).toBe(400);
    expect((await reset(token)).status).toBe(200);
  });

  test('an account deactivated after verifying cannot complete the reset', async () => {
    const user = await createUser();
    const token = await getResetToken();
    await User.updateOne({ _id: user._id }, { $set: { status: USER_STATUS.INACTIVE } });
    expect((await reset(token)).status).toBe(400);
  });
});

describe('sessions and normal login', () => {
  test('sessions from before the reset are signed out; a fresh login works immediately', async () => {
    await createUser();
    const oldSession = (await login(EMAIL, OLD_PASSWORD)).body.data.token;
    await new Promise((r) => setTimeout(r, 1100));
    await reset(await getResetToken());

    const stale = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldSession}`);
    expect(stale.status).toBe(401);
    const fresh = (await login(EMAIL, NEW_PASSWORD)).body.data.token;
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${fresh}`)).status).toBe(200);
  });

  test('other users and normal login are unaffected', async () => {
    await createUser();
    await createUser('other@zorx.test');
    await reset(await getResetToken());
    expect((await login('other@zorx.test', OLD_PASSWORD)).status).toBe(200);
  });

  test('the old link endpoint no longer exists', async () => {
    expect((await request(app).post('/api/auth/reset-password/verify').send({ token: 'a'.repeat(64) })).status).toBe(404);
  });
});
