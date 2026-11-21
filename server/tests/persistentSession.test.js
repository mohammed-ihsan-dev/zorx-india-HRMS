import request from 'supertest';
import jwt from 'jsonwebtoken';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { AuthSession } from '../src/models/AuthSession.js';
import { Attendance } from '../src/models/Attendance.js';
import { ROLES } from '../src/utils/constants.js';
import { ROTATION_GRACE_MS, refreshCookieOptions, rotateSession } from '../src/services/authSessionService.js';
import { invalidatePrincipalCache } from '../src/services/principalCache.js';

// Persistent sign-in: 15-minute access token in memory + rotating refresh token in
// an httpOnly cookie, tracked server-side, at most 30 days from sign-in.
const app = createApp();
const PASSWORD = 'Test@12345';
const CLIENT = { 'X-ZORX-Client': 'session', 'X-ZORX-CSRF': '1' };
const OFFICE = { latitude: 10.991401, longitude: 76.442772 };

async function account(email, role = ROLES.EMPLOYEE, extra = {}) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role, ...extra });
  const emp = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: email.split('@')[0], lastName: 'T', joiningDate: new Date('2024-01-01') });
  user.employeeId = emp._id;
  await user.save();
  return { user, employee: emp };
}

/** Logs in like the current app: returns the agent (holding the cookie) and the access token. */
async function signIn(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set(CLIENT).send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return { agent, res, accessToken: res.body.data.accessToken };
}
const cookieOf = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('zorx_rt='));
const cookieValue = (res) => cookieOf(res)?.split(';')[0].slice('zorx_rt='.length);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  invalidatePrincipalCache();
  await OfficeSettings.create({ officeName: 'ZORX INDIA', ...OFFICE, attendanceRadius: 200, workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: 'Asia/Kolkata' });
});

describe('login', () => {
  test('the current app gets a 15-minute access token and an httpOnly, Strict, /api/auth-scoped refresh cookie', async () => {
    await account('staff@zorx.test');
    const { res, accessToken } = await signIn('staff@zorx.test');
    expect(res.body.data.token).toBeUndefined(); // no long-lived token in the body
    const claims = jwt.decode(accessToken);
    expect(claims.typ).toBe('access');
    expect(claims.sid).toBeTruthy();
    expect(claims.exp - claims.iat).toBe(15 * 60);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    const session = await AuthSession.findById(claims.sid).lean();
    expect(Math.round((session.expiresAt - session.authenticatedAt) / 86400000)).toBe(30);
    // Only a hash is stored, never the token itself.
    expect(session.tokenHash).not.toContain(cookieValue(res).split('.')[1]);
  });

  test('in production the cookie is also Secure', () => {
    const previous = env.auth.cookieSecure;
    env.auth.cookieSecure = true;
    try {
      expect(refreshCookieOptions(new Date())).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth' });
    } finally {
      env.auth.cookieSecure = previous;
    }
  });

  test('an app version from before this change still gets its 8-hour token and no cookie', async () => {
    await account('old@zorx.test');
    const res = await request(app).post('/api/auth/login').send({ email: 'old@zorx.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(cookieOf(res)).toBeUndefined();
    const { exp, iat, typ } = jwt.decode(res.body.data.token);
    expect(typ).toBeUndefined();
    expect(exp - iat).toBe(8 * 3600);
    expect((await request(app).get('/api/auth/me').set(bearer(res.body.data.token))).status).toBe(200);
  });

  test('wrong password: no session is created', async () => {
    await account('staff@zorx.test');
    const res = await request(app).post('/api/auth/login').set(CLIENT).send({ email: 'staff@zorx.test', password: 'nope-nope' });
    expect(res.status).toBe(401);
    expect(cookieOf(res)).toBeUndefined();
    expect(await AuthSession.countDocuments()).toBe(0);
  });
});

describe('restoring the session (reopening the browser)', () => {
  test('refresh with only the cookie returns a new access token and the user, and rotates the cookie', async () => {
    await account('staff@zorx.test');
    const { agent, res: login } = await signIn('staff@zorx.test');
    const before = cookieValue(login);
    const res = await agent.post('/api/auth/refresh').set(CLIENT);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('staff@zorx.test');
    expect(jwt.decode(res.body.data.accessToken).typ).toBe('access');
    expect(cookieValue(res)).toBeTruthy();
    expect(cookieValue(res)).not.toBe(before);
    expect((await request(app).get('/api/auth/me').set(bearer(res.body.data.accessToken))).status).toBe(200);
  });

  test('refresh never extends the 30-day limit', async () => {
    await account('staff@zorx.test');
    const { agent, accessToken } = await signIn('staff@zorx.test');
    const { sid } = jwt.decode(accessToken);
    const { expiresAt } = await AuthSession.findById(sid).lean();
    await agent.post('/api/auth/refresh').set(CLIENT);
    await agent.post('/api/auth/refresh').set(CLIENT);
    expect((await AuthSession.findById(sid).lean()).expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  test('after 30 days the session has ended and the cookie is cleared', async () => {
    await account('staff@zorx.test');
    const { agent, accessToken } = await signIn('staff@zorx.test');
    await AuthSession.updateOne({ _id: jwt.decode(accessToken).sid }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await agent.post('/api/auth/refresh').set(CLIENT);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_ENDED');
    expect(cookieOf(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  test('?include=today also returns today’s attendance and WFH status (one request to a usable Check-in)', async () => {
    await account('staff@zorx.test');
    const { agent } = await signIn('staff@zorx.test');
    const res = await agent.post('/api/auth/refresh?include=today').set(CLIENT);
    expect(res.status).toBe(200);
    expect(res.body.data.today.attendance).toMatchObject({ attendance: null });
    expect(res.body.data.today.attendance.officeSettings).toBeTruthy();
    expect(res.body.data.today.wfh).toMatchObject({ approved: false, defaultWfh: false });
  });

  test('no cookie, a malformed cookie or an unknown session → 401 SESSION_ENDED', async () => {
    expect((await request(app).post('/api/auth/refresh').set(CLIENT)).body.code).toBe('SESSION_ENDED');
    const bad = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', 'zorx_rt=garbage');
    expect(bad.status).toBe(401);
    const unknown = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', `zorx_rt=${'a'.repeat(24)}.${'b'.repeat(43)}`);
    expect(unknown.status).toBe(401);
  });
});

describe('CSRF protection on cookie endpoints', () => {
  test('refresh without the app header, or from another origin, is refused', async () => {
    await account('staff@zorx.test');
    const { agent } = await signIn('staff@zorx.test');
    expect((await agent.post('/api/auth/refresh')).status).toBe(403);
    expect((await agent.post('/api/auth/refresh').set(CLIENT).set('Origin', 'https://evil.example')).status).toBe(403);
    expect((await agent.post('/api/auth/refresh').set(CLIENT).set('Origin', 'https://www.zorxindia.online')).status).toBe(200);
  });
});

describe('rotation, concurrency and reuse detection', () => {
  test('two tabs refreshing at the same moment with the same cookie both succeed', async () => {
    await account('staff@zorx.test');
    const { res: login } = await signIn('staff@zorx.test');
    const cookie = `zorx_rt=${cookieValue(login)}`;
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', cookie),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  test('a replayed old refresh token (after the grace window) revokes the whole session', async () => {
    await account('staff@zorx.test');
    const { res: login, accessToken } = await signIn('staff@zorx.test');
    const stolen = cookieValue(login);
    const first = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', `zorx_rt=${stolen}`);
    const current = cookieValue(first);
    const second = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', `zorx_rt=${current}`);
    expect(second.status).toBe(200);
    // `stolen` is two rotations old: never accepted, and the session is ended for everyone.
    const replay = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', `zorx_rt=${stolen}`);
    expect(replay.status).toBe(401);
    const session = await AuthSession.findById(jwt.decode(accessToken).sid).lean();
    expect(session.revokedReason).toBe('refresh_token_reuse');
    expect((await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', `zorx_rt=${cookieValue(second)}`)).status).toBe(401);
  });

  test('the just-replaced token is accepted only within the grace window', async () => {
    const { user } = await account('staff@zorx.test');
    const { res: login } = await signIn('staff@zorx.test');
    const original = cookieValue(login);
    await rotateSession(original); // another tab rotated it
    const later = new Date(Date.now() + ROTATION_GRACE_MS + 1000);
    await expect(rotateSession(original, { now: later })).rejects.toMatchObject({ reason: 'reused' });
    expect((await AuthSession.findOne({ userId: user._id }).lean()).revokedAt).toBeTruthy();
  });
});

describe('access token expiry', () => {
  test('an expired access token is refused with TOKEN_EXPIRED (the app then refreshes)', async () => {
    const { user } = await account('staff@zorx.test');
    const expired = jwt.sign({ sub: String(user._id), role: user.role, sid: 'x', typ: 'access', iat: Math.floor(Date.now() / 1000) - 3600 }, env.jwtSecret, { expiresIn: '15m' });
    const res = await request(app).get('/api/attendance/me/today').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

describe('ending sessions', () => {
  test('logout revokes this session; the cookie can no longer restore it', async () => {
    await account('staff@zorx.test');
    const { agent, res: login } = await signIn('staff@zorx.test');
    expect((await agent.post('/api/auth/logout').set(CLIENT)).status).toBe(200);
    const res = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', `zorx_rt=${cookieValue(login)}`);
    expect(res.status).toBe(401);
  });

  test('logout-all ends every device and refuses tokens already issued', async () => {
    await account('staff@zorx.test');
    const phone = await signIn('staff@zorx.test');
    const laptop = await signIn('staff@zorx.test');
    const legacy = (await request(app).post('/api/auth/login').send({ email: 'staff@zorx.test', password: PASSWORD })).body.data.token;
    await new Promise((r) => setTimeout(r, 1100)); // token iat is in whole seconds
    expect((await request(app).post('/api/auth/logout-all').set(bearer(laptop.accessToken))).status).toBe(200);
    expect((await phone.agent.post('/api/auth/refresh').set(CLIENT)).status).toBe(401);
    expect((await laptop.agent.post('/api/auth/refresh').set(CLIENT)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer(phone.accessToken))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer(legacy))).status).toBe(401);
  });

  test('a password reset ends existing sessions', async () => {
    const { user } = await account('staff@zorx.test');
    const { agent } = await signIn('staff@zorx.test');
    await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date(Date.now() + 2000) } });
    const res = await agent.post('/api/auth/refresh').set(CLIENT);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_ENDED');
  });

  test('deactivating an employee signs them out everywhere', async () => {
    const { employee } = await account('staff@zorx.test');
    await account('hr@zorx.test', ROLES.ADMIN);
    const staff = await signIn('staff@zorx.test');
    const hr = await signIn('hr@zorx.test');
    const res = await request(app).patch(`/api/employees/${employee._id}/status`).set(bearer(hr.accessToken)).send({ status: 'INACTIVE' });
    expect(res.status).toBe(200);
    expect((await staff.agent.post('/api/auth/refresh').set(CLIENT)).status).toBe(401);
    expect((await request(app).get('/api/attendance/me/today').set(bearer(staff.accessToken))).status).toBe(403);
    expect(await AuthSession.countDocuments({ revokedReason: 'deactivated' })).toBe(1);
  });

  test('changing the password keeps this device signed in and signs out the others', async () => {
    await account('staff@zorx.test');
    const here = await signIn('staff@zorx.test');
    const other = await signIn('staff@zorx.test');
    const res = await request(app).post('/api/auth/change-password').set(bearer(here.accessToken)).send({ currentPassword: PASSWORD, newPassword: 'BrandNew@123' });
    expect(res.status).toBe(200);
    expect((await here.agent.post('/api/auth/refresh').set(CLIENT)).status).toBe(200);
    expect((await other.agent.post('/api/auth/refresh').set(CLIENT)).status).toBe(401);
  });
});

describe('first-login password change and roles are unchanged', () => {
  test('a must-change-password account restores its session but can only change the password', async () => {
    await account('new@zorx.test', ROLES.EMPLOYEE, { mustChangePassword: true });
    const { agent, accessToken } = await signIn('new@zorx.test');
    const restored = await agent.post('/api/auth/refresh?include=today').set(CLIENT);
    expect(restored.body.data.user.mustChangePassword).toBe(true);
    expect(restored.body.data.today).toBeUndefined();
    expect((await request(app).get('/api/attendance/me/today').set(bearer(accessToken))).status).toBe(403);
    expect((await request(app).post('/api/auth/change-password').set(bearer(accessToken)).send({ newPassword: 'BrandNew@123' })).status).toBe(200);
  });

  test('an employee access token still cannot reach admin routes', async () => {
    await account('staff@zorx.test');
    const { accessToken } = await signIn('staff@zorx.test');
    expect((await request(app).get('/api/employees').set(bearer(accessToken))).status).toBe(403);
  });
});

describe('moving a saved 8-hour token to a persistent session', () => {
  const legacyToken = (user, issuedSecondsAgo = 60, expiresIn = '8h') =>
    jwt.sign({ sub: String(user._id), role: user.role, iat: Math.floor(Date.now() / 1000) - issuedSecondsAgo }, env.jwtSecret, { expiresIn });

  test('a still-valid legacy token is upgraded; the session counts from when it was issued', async () => {
    const { user } = await account('staff@zorx.test');
    const issued = 3 * 3600;
    const res = await request(app).post('/api/auth/session/upgrade').set(CLIENT).set(bearer(legacyToken(user, issued)));
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toMatch(/HttpOnly/i);
    const session = await AuthSession.findOne({ userId: user._id }).lean();
    const expectedEnd = (Math.floor(Date.now() / 1000) - issued) * 1000 + 30 * 86400000;
    expect(Math.abs(session.expiresAt.getTime() - expectedEnd)).toBeLessThan(5000);
  });

  test('an expired legacy token is never turned into a session', async () => {
    const { user } = await account('staff@zorx.test');
    const expired = jwt.sign({ sub: String(user._id), role: user.role, iat: Math.floor(Date.now() / 1000) - 9 * 3600 }, env.jwtSecret, { expiresIn: '8h' });
    const res = await request(app).post('/api/auth/session/upgrade').set(CLIENT).set(bearer(expired));
    expect(res.status).toBe(401);
    expect(await AuthSession.countDocuments()).toBe(0);
  });

  test('an access token (already a session) or a token from before a password reset is refused', async () => {
    const { user } = await account('staff@zorx.test');
    const { accessToken } = await signIn('staff@zorx.test');
    expect((await request(app).post('/api/auth/session/upgrade').set(CLIENT).set(bearer(accessToken))).status).toBe(401);
    const old = legacyToken(user, 3600);
    await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date() } });
    expect((await request(app).post('/api/auth/session/upgrade').set(CLIENT).set(bearer(old))).status).toBe(401);
  });
});

describe('attendance: duplicate submissions', () => {
  test('two check-ins at once record exactly one; the other is refused', async () => {
    const { employee } = await account('staff@zorx.test');
    const { accessToken } = await signIn('staff@zorx.test');
    const [a, b] = await Promise.all([
      request(app).post('/api/attendance/check-in').set(bearer(accessToken)).send(OFFICE),
      request(app).post('/api/attendance/check-in').set(bearer(accessToken)).send(OFFICE),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await Attendance.countDocuments({ employeeId: employee._id })).toBe(1);
  });

  test('a retried check-out never overwrites the first check-out time', async () => {
    const { employee } = await account('staff@zorx.test');
    const { accessToken } = await signIn('staff@zorx.test');
    expect((await request(app).post('/api/attendance/check-in').set(bearer(accessToken)).send(OFFICE)).status).toBe(200);
    const first = await request(app).post('/api/attendance/check-out').set(bearer(accessToken)).send(OFFICE);
    expect(first.status).toBe(200);
    const at = (await Attendance.findOne({ employeeId: employee._id }).lean()).checkOut.timestamp.getTime();
    const [x, y] = await Promise.all([
      request(app).post('/api/attendance/check-out').set(bearer(accessToken)).send(OFFICE),
      request(app).post('/api/attendance/check-out').set(bearer(accessToken)).send(OFFICE),
    ]);
    expect([x.status, y.status]).toEqual([409, 409]);
    expect((await Attendance.findOne({ employeeId: employee._id }).lean()).checkOut.timestamp.getTime()).toBe(at);
  });

  test('two check-outs at once: one succeeds, one is refused', async () => {
    await account('staff@zorx.test');
    const { accessToken } = await signIn('staff@zorx.test');
    await request(app).post('/api/attendance/check-in').set(bearer(accessToken)).send(OFFICE);
    const [x, y] = await Promise.all([
      request(app).post('/api/attendance/check-out').set(bearer(accessToken)).send(OFFICE),
      request(app).post('/api/attendance/check-out').set(bearer(accessToken)).send(OFFICE),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });
});

describe('short account cache never outlives an in-app change', () => {
  const previous = process.env.PRINCIPAL_CACHE_MS;
  beforeEach(() => (process.env.PRINCIPAL_CACHE_MS = '60000'));
  afterEach(() => {
    if (previous === undefined) delete process.env.PRINCIPAL_CACHE_MS;
    else process.env.PRINCIPAL_CACHE_MS = previous;
  });

  test('deactivation applies to the very next request even while the account is cached', async () => {
    const { employee } = await account('staff@zorx.test');
    await account('hr@zorx.test', ROLES.ADMIN);
    const staff = await signIn('staff@zorx.test');
    const hr = await signIn('hr@zorx.test');
    expect((await request(app).get('/api/auth/me').set(bearer(staff.accessToken))).status).toBe(200); // now cached
    await request(app).patch(`/api/employees/${employee._id}/status`).set(bearer(hr.accessToken)).send({ status: 'INACTIVE' });
    expect((await request(app).get('/api/auth/me').set(bearer(staff.accessToken))).status).toBe(403);
  });

  test('a role change applies to the very next request', async () => {
    const { user } = await account('staff@zorx.test');
    const staff = await signIn('staff@zorx.test');
    expect((await request(app).get('/api/auth/me').set(bearer(staff.accessToken))).body.data.role).toBe(ROLES.EMPLOYEE);
    await User.updateOne({ _id: user._id }, { $set: { role: ROLES.ADMIN } });
    expect((await request(app).get('/api/auth/me').set(bearer(staff.accessToken))).body.data.role).toBe(ROLES.ADMIN);
  });
});

describe('cold start: API requests wait for the database', () => {
  test('health answers at once; API requests wait for the connection, then proceed', async () => {
    let connect;
    const dbReady = new Promise((r) => (connect = r));
    const starting = createApp({ dbReady });
    expect((await request(starting).get('/api/health')).status).toBe(200);
    const pending = request(starting).get('/api/auth/me');
    setTimeout(connect, 50);
    expect((await pending).status).toBe(401); // reached the route (no token), not 503
  });

  test('a failed connection gives a clear 503 instead of hanging', async () => {
    const dbReady = Promise.reject(new Error('down'));
    dbReady.catch(() => {});
    const res = await request(createApp({ dbReady })).get('/api/auth/me');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVER_STARTING');
  });
});
