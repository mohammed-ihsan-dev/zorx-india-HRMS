import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// A browser-like localStorage before the module loads.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};

// A fake API: `handler(req, body)` → { status, body }.
let handler = () => ({ status: 404, body: {} });
const calls = [];
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    calls.push({ url: req.url, headers: req.headers });
    const out = await handler(req, raw);
    if (out === 'hang') return; // never answers
    res.writeHead(out.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out.body));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
after(() => server.close());

const session = await import('./session.js');
session._authHttp.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;

const ok = (token = 'access-1', ttlMs = 15 * 60 * 1000, extra = {}) => ({
  status: 200,
  body: { data: { accessToken: token, accessTokenExpiresAt: new Date(Date.now() + ttlMs).toISOString(), user: { id: 'u1', role: 'EMPLOYEE' }, ...extra } },
});
const ended = { status: 401, body: { code: 'SESSION_ENDED' } };

beforeEach(() => {
  store.clear();
  calls.length = 0;
  session._resetSession();
});

test('restoring sends the app + CSRF headers and keeps the access token in memory only', async () => {
  handler = () => ok();
  store.set(session.SESSION_HINT_KEY, '1');
  const data = await session.restoreSession();
  assert.equal(data.user.id, 'u1');
  assert.equal(session.getAccessToken(), 'access-1');
  assert.equal(calls[0].url, '/api/auth/refresh');
  assert.equal(calls[0].headers['x-zorx-csrf'], '1');
  assert.equal(calls[0].headers['x-zorx-client'], 'session');
  for (const v of store.values()) assert.ok(!String(v).includes('access-1'), 'token must never be stored');
  assert.equal(store.get(session.SESSION_HINT_KEY), '1');
});

test('at start-up on a dashboard it asks for today’s attendance in the same request', async () => {
  handler = () => ok();
  await session.restoreSession({ includeToday: true });
  assert.equal(calls[0].url, '/api/auth/refresh?include=today');
});

test('simultaneous restores share one request (no refresh storm)', async () => {
  handler = () => ok();
  const results = await Promise.all([session.restoreSession(), session.restoreSession(), session.restoreSession()]);
  assert.equal(calls.length, 1);
  assert.ok(results.every((r) => r.accessToken === 'access-1'));
});

test('no session → null, and the session flag is cleared (login page, no loop)', async () => {
  handler = () => ended;
  store.set(session.SESSION_HINT_KEY, '1');
  assert.equal(await session.restoreSession(), null);
  assert.equal(store.has(session.SESSION_HINT_KEY), false);
  assert.equal(calls.length, 1);
});

test('a still-valid token from an older app version is moved to a session once, then deleted', async () => {
  store.set(session.LEGACY_TOKEN_KEY, 'legacy-8h');
  handler = (req) => (req.url.startsWith('/api/auth/refresh') ? ended : ok('access-from-upgrade'));
  const data = await session.restoreSession();
  assert.equal(data.accessToken, 'access-from-upgrade');
  assert.equal(calls[1].url, '/api/auth/session/upgrade');
  assert.equal(calls[1].headers.authorization, 'Bearer legacy-8h');
  assert.equal(store.has(session.LEGACY_TOKEN_KEY), false);
});

test('an expired legacy token is not upgraded: null, and it is deleted', async () => {
  store.set(session.LEGACY_TOKEN_KEY, 'legacy-expired');
  handler = () => ({ status: 401, body: { code: 'TOKEN_EXPIRED' } });
  assert.equal(await session.restoreSession(), null);
  assert.equal(store.has(session.LEGACY_TOKEN_KEY), false);
});

test('a waking server (503, then OK) is retried within the deadline', async () => {
  let n = 0;
  handler = () => (++n < 2 ? { status: 503, body: { code: 'SERVER_STARTING' } } : ok());
  const data = await session.restoreSession({ deadlineMs: 20_000 });
  assert.equal(data.accessToken, 'access-1');
  assert.equal(calls.length, 2);
});

test('unreachable until the deadline → rejects (the app offers "Try again") and keeps the session flag', async () => {
  store.set(session.SESSION_HINT_KEY, '1');
  handler = () => ({ status: 503, body: {} });
  await assert.rejects(session.restoreSession({ deadlineMs: 3_000 }));
  assert.equal(store.get(session.SESSION_HINT_KEY), '1');
});

test('slow restore triggers the "connecting" callback', async () => {
  handler = () => new Promise((r) => setTimeout(() => r(ok()), session.SLOW_AFTER_MS + 300));
  let slow = false;
  await session.restoreSession({ onSlow: () => (slow = true) });
  assert.equal(slow, true);
});

test('an access token about to expire is renewed before use; a fresh one is reused', async () => {
  handler = () => ok('short', 30_000); // expires within the renewal margin
  await session.restoreSession();
  handler = () => ok('renewed');
  assert.equal(await session.ensureAccessToken(), 'renewed');
  assert.equal(await session.ensureAccessToken(), 'renewed');
  assert.equal(calls.length, 2);
});

test('signed out: no token and no request', async () => {
  handler = () => ok();
  assert.equal(await session.ensureAccessToken(), null);
  assert.equal(calls.length, 0);
});

test('renewal after the session ended reports "ended" once', async () => {
  handler = () => ok('short', 30_000);
  await session.restoreSession();
  handler = () => ended;
  const events = [];
  session.onSessionEvent((e) => events.push(e));
  assert.equal(await session.renewAccessToken(), null);
  assert.deepEqual(events, ['ended']);
});

test('an API still on the previous version (deploy rolling out): its plain `token` login response works', async () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 8 * 3600 })).toString('base64url');
  const legacy = `h.${payload}.s`;
  handler = () => ({ status: 200, body: { data: { token: legacy, user: { id: 'u1' } } } });
  await session.loginRequest('a@b.c', 'x');
  assert.equal(session.getAccessToken(), legacy);
  assert.equal(await session.ensureAccessToken(), legacy); // valid for hours: used as is
});
