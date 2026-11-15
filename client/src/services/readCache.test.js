import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cachedRead, invalidateRead, setCacheOwner, clearReadCache, READ_CACHE_TTL_MS } from './readCache.js';

const counter = (value = 'v') => {
  let n = 0;
  const f = async () => {
    n += 1;
    return `${value}${n}`;
  };
  f.calls = () => n;
  return f;
};

beforeEach(() => {
  setCacheOwner(null);
  clearReadCache();
});

test('TTL is 50 minutes', () => assert.equal(READ_CACHE_TTL_MS, 50 * 60 * 1000));

test('reuses a fresh result instead of refetching', async () => {
  setCacheOwner('u1|EMPLOYEE');
  const f = counter();
  assert.equal(await cachedRead('holidays', { y: 2026 }, f), 'v1');
  assert.equal(await cachedRead('holidays', { y: 2026 }, f), 'v1');
  assert.equal(f.calls(), 1);
});

test('expires after the TTL', async () => {
  setCacheOwner('u1|EMPLOYEE');
  let t = 0;
  const now = () => t;
  const f = counter();
  await cachedRead('holidays', null, f, { now });
  t = READ_CACHE_TTL_MS + 1;
  assert.equal(await cachedRead('holidays', null, f, { now }), 'v2');
});

test('different query parameters are cached separately', async () => {
  setCacheOwner('u1|EMPLOYEE');
  const f = counter();
  await cachedRead('holidays', { from: '2026-11-01' }, f);
  await cachedRead('holidays', { from: '2026-12-01' }, f);
  assert.equal(f.calls(), 2);
});

test('another user never sees the previous user’s cached data', async () => {
  setCacheOwner('u1|EMPLOYEE');
  await cachedRead('announcements', null, async () => 'for-u1');
  setCacheOwner('u2|ADMIN');
  assert.equal(await cachedRead('announcements', null, async () => 'for-u2'), 'for-u2');
});

test('logout clears the cache (no owner → nothing cached)', async () => {
  setCacheOwner('u1|EMPLOYEE');
  await cachedRead('departments', null, async () => 'cached');
  setCacheOwner(null);
  const f = counter();
  await cachedRead('departments', null, f);
  await cachedRead('departments', null, f);
  assert.equal(f.calls(), 2);
});

test('invalidation after a write forces a fresh read', async () => {
  setCacheOwner('u1|ADMIN');
  const f = counter();
  await cachedRead('departments', null, f);
  invalidateRead('departments');
  assert.equal(await cachedRead('departments', null, f), 'v2');
});

test('concurrent readers share one request; failures are not cached', async () => {
  setCacheOwner('u1|EMPLOYEE');
  const f = counter();
  const [a, b] = await Promise.all([cachedRead('x', null, f), cachedRead('x', null, f)]);
  assert.equal(a, b);
  assert.equal(f.calls(), 1);
  await assert.rejects(cachedRead('y', null, async () => Promise.reject(new Error('down'))));
  assert.equal(await cachedRead('y', null, async () => 'ok'), 'ok');
});
