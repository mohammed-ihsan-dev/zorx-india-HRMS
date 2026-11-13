import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { createApiLimiter, apiRateLimitKey } from '../src/middleware/apiRateLimit.js';

// 2026-11-13 regression: everyone in the office shares one IP, and a per-IP limit
// meant one busy office blocked check-out for all. Each signed-in user now has
// their own allowance; anonymous / forged-token traffic is still limited per IP.
const token = (sub) => jwt.sign({ sub, role: 'EMPLOYEE' }, env.jwtSecret, { expiresIn: '1h' });
function app() {
  const a = express();
  a.use('/api', createApiLimiter({ limit: 3 }));
  a.post('/api/attendance/check-out', (req, res) => res.json({ success: true }));
  return a;
}
const hit = (a, t) => {
  const r = request(a).post('/api/attendance/check-out');
  return t ? r.set('Authorization', `Bearer ${t}`) : r;
};

test('colleagues on the same office IP each keep their own allowance', async () => {
  const a = app();
  const busy = token('busy-colleague');
  for (let i = 0; i < 3; i++) expect((await hit(a, busy)).status).toBe(200);
  expect((await hit(a, busy)).status).toBe(429); // the busy user is limited…
  expect((await hit(a, token('mishab'))).status).toBe(200); // …but another user from the same IP can still check out
});

test('a 429 is JSON with a readable message', async () => {
  const a = app();
  const t = token('u1');
  for (let i = 0; i < 3; i++) await hit(a, t);
  const res = await hit(a, t);
  expect(res.status).toBe(429);
  expect(res.body).toEqual({ success: false, message: expect.stringMatching(/too many requests/i) });
});

test('anonymous requests and forged tokens are limited per IP (cannot mint fresh allowances)', async () => {
  const a = app();
  for (let i = 0; i < 3; i++) expect((await hit(a, `forged-${i}`)).status).toBe(200);
  expect((await hit(a)).status).toBe(429);
  expect((await hit(a, 'forged-new')).status).toBe(429);
  const forgedSig = jwt.sign({ sub: 'someone' }, 'not-the-secret');
  expect((await hit(a, forgedSig)).status).toBe(429);
});

test('key: verified user id, else IP; cookie token also recognised', () => {
  expect(apiRateLimitKey({ headers: { authorization: `Bearer ${token('abc')}` }, ip: '1.2.3.4' })).toBe('user:abc');
  expect(apiRateLimitKey({ headers: {}, cookies: { token: token('xyz') }, ip: '1.2.3.4' })).toBe('user:xyz');
  expect(apiRateLimitKey({ headers: { authorization: 'Bearer junk' }, ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
  expect(apiRateLimitKey({ headers: {}, ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
});

test('API responses carry a Server-Timing header (timing instrumentation)', async () => {
  const { createApp } = await import('../src/app.js');
  const res = await request(createApp()).get('/api/health');
  // /api/health is answered before the JSON wrapper on some setups; check any JSON API answer.
  const res2 = await request(createApp()).get('/api/attendance/me/today');
  const header = res.headers['server-timing'] || res2.headers['server-timing'];
  expect(header).toMatch(/^app;dur=\d+(\.\d+)?$/);
});
