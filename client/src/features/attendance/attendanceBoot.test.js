import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startAttendanceBoot, takeEarlyAttendance, markAttendanceSettled, afterAttendance, _resetAttendanceBoot, EARLY_MAX_AGE_MS } from './attendanceBoot.js';

const store = (token) => {
  const m = new Map(token ? [['zorx_token', token]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const fakeLoad = () => {
  let calls = 0;
  const fn = () => {
    calls += 1;
    return Promise.resolve([{ attendance: null }, { approved: false }]);
  };
  fn.calls = () => calls;
  return fn;
};

beforeEach(() => _resetAttendanceBoot());

test('a signed-in user opening a dashboard starts the attendance load at boot; the dashboard takes it once', async () => {
  const load = fakeLoad();
  assert.equal(startAttendanceBoot({ pathname: '/', storage: store('t1'), load }), true);
  assert.equal(load.calls(), 1);
  const p = takeEarlyAttendance();
  assert.ok(p);
  assert.deepEqual(await p, [{ attendance: null }, { approved: false }]);
  assert.equal(takeEarlyAttendance(), null); // only the first load uses it; later refreshes go to the server
});

test('no token, or not a dashboard page → nothing is started', () => {
  const load = fakeLoad();
  assert.equal(startAttendanceBoot({ pathname: '/', storage: store(null), load }), false);
  assert.equal(startAttendanceBoot({ pathname: '/leave', storage: store('t1'), load }), false);
  assert.equal(load.calls(), 0);
  assert.equal(takeEarlyAttendance(), null);
});

test('never hands over another user’s data: token changed since boot → discarded', () => {
  const s = store('user-A');
  startAttendanceBoot({ pathname: '/', storage: s, load: fakeLoad() });
  s.setItem('zorx_token', 'user-B');
  assert.equal(takeEarlyAttendance(), null);
});

test('a stale early result is discarded', () => {
  startAttendanceBoot({ pathname: '/', storage: store('t1'), load: fakeLoad() });
  assert.equal(takeEarlyAttendance(Date.now() + EARLY_MAX_AGE_MS + 1), null);
});

test('a failed early load is not swallowed into a fake answer (the dashboard reloads normally)', async () => {
  startAttendanceBoot({ pathname: '/', storage: store('t1'), load: () => Promise.reject(new Error('network')) });
  await assert.rejects(takeEarlyAttendance(), /network/);
});

test('secondary requests wait for attendance, then go', async () => {
  startAttendanceBoot({ pathname: '/', storage: store('t1'), load: fakeLoad(), maxWaitMs: 10_000 });
  let released = false;
  const waiting = afterAttendance().then(() => {
    released = true;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(released, false);
  markAttendanceSettled();
  await waiting;
  assert.equal(released, true);
});

test('secondary requests are never held longer than the cap', async () => {
  startAttendanceBoot({ pathname: '/', storage: store('t1'), load: () => new Promise(() => {}), maxWaitMs: 30 });
  const t = Date.now();
  await afterAttendance();
  assert.ok(Date.now() - t < 1000);
});

test('no attendance-first start (other pages) → secondary requests are not delayed', async () => {
  const t = Date.now();
  await afterAttendance();
  assert.ok(Date.now() - t < 50);
});
