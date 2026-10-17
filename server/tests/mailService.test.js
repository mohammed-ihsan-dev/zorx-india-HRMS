import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { setMailTransportForTests, sendMailWithResult, runMailDiagnostic, maskEmail, createResendTransport, getMailProvider, mailConfigWarnings } from '../src/services/mailService.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const ORIGINAL_MAIL = { ...env.mail };
const SECRET = 'super-secret-smtp-password';
const smtpError = (props) => Object.assign(new Error(props.message || 'smtp error'), props);

function captureLogs() {
  const lines = [];
  const orig = { info: console.info, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.join(' '));
  return { lines, restore: () => Object.assign(console, orig) };
}

async function login(role, email) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: role, lastName: 'Test', joiningDate: new Date('2025-01-01') });
  user.employeeId = employee._id;
  await user.save();
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
}

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  Object.assign(env.mail, ORIGINAL_MAIL);
  setMailTransportForTests(null);
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  Object.assign(env.mail, { host: 'smtp.hostinger.com', port: 465, secure: true, user: 'noreply@zorxmedia.com', pass: SECRET, from: 'ZORX INDIA <noreply@zorxmedia.com>', resendApiKey: '' });
});

describe('sendMailWithResult classification and logging', () => {
  test.each([
    [{ code: 'ETIMEDOUT', message: 'Connection timeout' }, 'CONNECTION_FAILED'],
    [{ code: 'ECONNREFUSED' }, 'CONNECTION_FAILED'],
    [{ code: 'ENETUNREACH', message: 'Network is unreachable' }, 'CONNECTION_FAILED'],
    [{ code: 'EAUTH', responseCode: 535, message: 'Invalid login: 535 5.7.8 authentication failed' }, 'AUTH_FAILED'],
    [{ code: 'EENVELOPE', responseCode: 553, message: 'Sender address rejected: not owned by user noreply@zorxmedia.com' }, 'REJECTED_BY_PROVIDER'],
    [{ code: 'ETLS', message: 'TLS handshake failed' }, 'TLS_FAILED'],
  ])('%o → %s', async (errProps, category) => {
    setMailTransportForTests({ sendMail: async () => { throw smtpError(errProps); } });
    const logs = captureLogs();
    const result = await sendMailWithResult({ to: 'employee@zorxmedia.com', subject: 'x', text: 'Your code is: 123456' });
    logs.restore();
    expect(result).toMatchObject({ ok: false, category });
    const all = logs.lines.join('\n');
    expect(all).toContain(category);
    expect(all).not.toContain('123456');
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain('employee@zorxmedia.com');
    expect(all).not.toContain('noreply@zorxmedia.com');
  });

  test('a successful send logs ACCEPTED with a masked recipient and no message content', async () => {
    setMailTransportForTests({ sendMail: async () => ({ accepted: ['employee@zorxmedia.com'], rejected: [], response: '250 OK queued' }) });
    const logs = captureLogs();
    const result = await sendMailWithResult({ to: 'employee@zorxmedia.com', subject: '654321 is your code', text: 'Your code is: 654321' });
    logs.restore();
    expect(result.ok).toBe(true);
    expect(logs.lines.join('\n')).toMatch(/ACCEPTED by smtp\.hostinger\.com:465 for em\*\*\*@zorxmedia\.com/);
    expect(logs.lines.join('\n')).not.toContain('654321');
  });

  test('a recipient rejected by the provider is not reported as success', async () => {
    setMailTransportForTests({ sendMail: async () => ({ accepted: [], rejected: ['employee@zorxmedia.com'] }) });
    expect((await sendMailWithResult({ to: 'employee@zorxmedia.com', subject: 'x', text: 'x' })).ok).toBe(false);
  });

  test('maskEmail keeps only the first two characters', () => {
    expect(maskEmail('zorxindia@gmail.com')).toBe('zo***@gmail.com');
  });
});

describe('runMailDiagnostic', () => {
  test('reports NOT_CONFIGURED when a setting is missing', async () => {
    env.mail.pass = '';
    expect(await runMailDiagnostic('a@b.co')).toMatchObject({ configured: false, category: 'NOT_CONFIGURED' });
  });

  test('a blocked/failed connection is reported without attempting delivery', async () => {
    setMailTransportForTests({ verify: async () => { throw smtpError({ code: 'ETIMEDOUT', message: 'Connection timeout' }); }, sendMail: async () => { throw new Error('should not send'); } });
    const r = await runMailDiagnostic('admin@zorxmedia.com');
    expect(r).toMatchObject({ connection: 'FAILED', delivery: 'SKIPPED', category: 'CONNECTION_FAILED', code: 'ETIMEDOUT' });
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  test('a working setup reports ACCEPTED_BY_PROVIDER and masks the mailbox', async () => {
    setMailTransportForTests({ verify: async () => true, sendMail: async () => ({ accepted: ['admin@zorxmedia.com'], rejected: [] }) });
    const r = await runMailDiagnostic('admin@zorxmedia.com');
    expect(r).toMatchObject({ connection: 'OK', delivery: 'ACCEPTED_BY_PROVIDER', config: { host: 'smtp.hostinger.com', port: 465, secure: true, user: 'no***@zorxmedia.com', passwordSet: true } });
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });
});

describe('POST /api/settings/mail/test', () => {
  test('Admin-only; sends only to the requesting admin', async () => {
    const sentTo = [];
    setMailTransportForTests({ verify: async () => true, sendMail: async (m) => { sentTo.push(m.to); return { accepted: [m.to], rejected: [] }; } });
    const adminToken = await login(ROLES.ADMIN, 'admin@zorx.test');
    const empToken = await login(ROLES.EMPLOYEE, 'emp@zorx.test');

    expect((await request(app).post('/api/settings/mail/test').set('Authorization', `Bearer ${empToken}`)).status).toBe(403);
    const res = await request(app).post('/api/settings/mail/test').set('Authorization', `Bearer ${adminToken}`).send({ to: 'attacker@evil.test' });
    expect(res.status).toBe(200);
    expect(res.body.data.delivery).toBe('ACCEPTED_BY_PROVIDER');
    expect(sentTo).toEqual(['admin@zorx.test']);
  });
});

describe('Resend HTTPS transport', () => {
  const API_KEY = 're_test_secret_key_123456';
  const fakeFetch = (responder) => {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return responder(calls.length);
    };
    fn.calls = calls;
    return fn;
  };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const useResend = (fetchImpl, timeoutMs) => setMailTransportForTests(createResendTransport({ apiKey: API_KEY, fetchImpl, timeoutMs }));

  beforeEach(() => {
    Object.assign(env.mail, { resendApiKey: API_KEY, from: 'ZORX INDIA <noreply@zorxindia.online>', host: '', user: '', pass: '' });
  });

  test('provider selection: Resend when RESEND_API_KEY is set (even if SMTP is also set)', () => {
    Object.assign(env.mail, { host: 'smtp.gmail.com', user: 'x@gmail.com', pass: 'x' });
    expect(getMailProvider()).toBe('resend');
    env.mail.resendApiKey = '';
    expect(getMailProvider()).toBe('smtp');
    Object.assign(env.mail, { host: '', user: '', pass: '' });
    expect(getMailProvider()).toBeNull();
  });

  test('missing MAIL_FROM or API key → NOT_CONFIGURED, nothing sent', async () => {
    env.mail.from = '';
    expect(await runMailDiagnostic('a@b.co')).toMatchObject({ configured: false, category: 'NOT_CONFIGURED' });
    env.mail.from = 'ZORX INDIA <noreply@zorxindia.online>';
    env.mail.resendApiKey = '';
    expect(await runMailDiagnostic('a@b.co')).toMatchObject({ configured: false, category: 'NOT_CONFIGURED' });
  });

  test('success: one POST to the Resend API with bearer auth, sender and recipient; message id returned', async () => {
    const f = fakeFetch(() => json(200, { id: 'msg_abc123' }));
    useResend(f);
    const logs = captureLogs();
    const r = await sendMailWithResult({ to: 'employee@zorxmedia.com', subject: '482910 is your ZORX INDIA password reset code', text: 'Your one-time code is: 482910', html: '<b>482910</b>' });
    logs.restore();

    expect(r).toMatchObject({ ok: true, messageId: 'msg_abc123' });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('https://api.resend.com/emails');
    expect(f.calls[0].init.method).toBe('POST');
    expect(f.calls[0].init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(f.calls[0].init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.calls[0].body).toMatchObject({ from: 'ZORX INDIA <noreply@zorxindia.online>', to: ['employee@zorxmedia.com'], subject: expect.stringContaining('password reset code') });

    const all = logs.lines.join('\n');
    expect(all).toMatch(/ACCEPTED by Resend for em\*\*\*@zorxmedia\.com \(Resend id msg_abc123\)/);
    expect(all).not.toContain('482910');
    expect(all).not.toContain(API_KEY);
    expect(all).not.toContain('employee@zorxmedia.com');
  });

  test.each([
    [401, { name: 'missing_api_key', message: 'Missing API key in the authorization header' }, 'AUTH_FAILED'],
    [403, { name: 'invalid_api_key', message: 'API key is invalid' }, 'AUTH_FAILED'],
    [403, { name: 'validation_error', message: 'The zorxindia.online domain is not verified. Please, add and verify your domain.' }, 'SENDER_NOT_VERIFIED'],
    [422, { name: 'validation_error', message: 'Invalid `to` field.' }, 'REJECTED_BY_PROVIDER'],
    [429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, 'RATE_LIMITED'],
    [500, { name: 'internal_server_error', message: 'Unexpected error' }, 'PROVIDER_ERROR'],
  ])('HTTP %i %o → %s, exactly one request (no automatic retry)', async (status, body, category) => {
    const f = fakeFetch(() => json(status, body));
    useResend(f);
    const logs = captureLogs();
    const r = await sendMailWithResult({ to: 'employee@zorxmedia.com', subject: 'x', text: 'Your one-time code is: 111222' });
    logs.restore();
    expect(r).toMatchObject({ ok: false, category, responseCode: status });
    expect(f.calls).toHaveLength(1);
    expect(logs.lines.join('\n')).not.toContain(API_KEY);
    expect(logs.lines.join('\n')).not.toContain('111222');
  });

  test('a network failure is a CONNECTION_FAILED, not a success', async () => {
    useResend(async () => { throw new TypeError('fetch failed'); });
    expect(await sendMailWithResult({ to: 'a@b.co', subject: 'x', text: 'x' })).toMatchObject({ ok: false, category: 'CONNECTION_FAILED' });
  });

  test('a slow provider is cut off by the timeout', async () => {
    const hang = (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    useResend(hang, 50);
    const t0 = Date.now();
    const r = await sendMailWithResult({ to: 'a@b.co', subject: 'x', text: 'x' });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r).toMatchObject({ ok: false, category: 'CONNECTION_FAILED', code: 'ETIMEDOUT' });
  });

  test('diagnostic reports Resend config without the key, and a sender problem clearly', async () => {
    useResend(fakeFetch(() => json(403, { name: 'validation_error', message: 'The zorxindia.online domain is not verified.' })));
    const r = await runMailDiagnostic('admin@zorxmedia.com');
    expect(r).toMatchObject({ config: { provider: 'resend', apiKeySet: true, host: 'api.resend.com' }, connection: 'OK', delivery: 'FAILED', category: 'SENDER_NOT_VERIFIED' });
    expect(JSON.stringify(r)).not.toContain(API_KEY);
  });
});

describe('POST /api/settings/mail/test cooldown', () => {
  test('repeated clicks within 30s send only one email', async () => {
    let sends = 0;
    setMailTransportForTests({ sendMail: async (m) => { sends += 1; return { accepted: [m.to], rejected: [] }; } });
    const adminToken = await login(ROLES.ADMIN, 'clicker@zorx.test');
    const results = await Promise.all([1, 2, 3].map(() => request(app).post('/api/settings/mail/test').set('Authorization', `Bearer ${adminToken}`)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 429, 429]);
    expect(sends).toBe(1);
  });
});

describe('mailConfigWarnings (startup log)', () => {
  test('flags a Gmail sender with Resend, a malformed key, and a missing provider — never the key', () => {
    Object.assign(env.mail, { resendApiKey: 'abc-secret', from: 'ZORX INDIA <zorxindia@gmail.com>', host: '', user: '', pass: '' });
    const w = mailConfigWarnings().join('\n');
    expect(w).toMatch(/gmail\.com, which cannot be verified in Resend/);
    expect(w).toMatch(/does not look like a Resend key/);
    expect(w).not.toContain('abc-secret');

    Object.assign(env.mail, { resendApiKey: 're_good', from: 'ZORX INDIA <noreply@zorxindia.online>' });
    expect(mailConfigWarnings()).toEqual([]);

    Object.assign(env.mail, { resendApiKey: '' });
    expect(mailConfigWarnings().join(' ')).toMatch(/No email provider configured/);
  });
});
