import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startAttendanceBoot, takeEarlyAttendance, markAttendanceSettled, afterAttendance, _resetAttendanceBoot, EARLY_MAX_AGE_MS } from './attendanceBoot.js';

// `identity()` = the account signed in now; `load()` resolves to { identity, value }.
const signedInAs = (who) => {
  let current = who;
  const identity = () => current;
  identity.switchTo = (next) => (current = next);
  return identity;
};
const fakeLoad = (who = 'u1') => {
  let calls = 0;
  const fn = () => {
    calls += 1;
    return Promise.resolve({ identity: who, value: [{ attendance: null }, { approved: false }] });
  };
  fn.calls = () => calls;
  return fn;
};

beforeEach(() => _resetAttendanceBoot());

test('a signed-in user opening a dashboard starts the attendance load at boot; the dashboard takes it once', async () => {
  const load = fakeLoad();
  assert.equal(startAttendanceBoot({ pathname: '/', signedIn: true, identity: signedInAs('u1'), load }), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(load.calls(), 1);
  const p = takeEarlyAttendance();
  assert.ok(p);
  assert.deepEqual(await p, [{ attendance: null }, { approved: false }]);
  assert.equal(takeEarlyAttendance(), null); // only the first load uses it; later refreshes go to the server
});

test('not signed in, or not a dashboard page → nothing is started', async () => {
  const load = fakeLoad();
  assert.equal(startAttendanceBoot({ pathname: '/', signedIn: false, identity: signedInAs(null), load }), false);
  assert.equal(startAttendanceBoot({ pathname: '/leave', signedIn: true, identity: signedInAs('u1'), load }), false);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(load.calls(), 0);
  assert.equal(takeEarlyAttendance(), null);
});

test('never hands over another user’s data: a different account is signed in now → rejected (dashboard reloads)', async () => {
  const identity = signedInAs('user-A');
  startAttendanceBoot({ pathname: '/', signedIn: true, identity, load: fakeLoad('user-A') });
  identity.switchTo('user-B');
  await assert.rejects(takeEarlyAttendance(), /another session/);
});

test('a result without a confirmed identity is never used', async () => {
  startAttendanceBoot({ pathname: '/', signedIn: true, identity: signedInAs(null), load: fakeLoad(null) });
  await assert.rejects(takeEarlyAttendance(), /another session/);
});

test('a stale early result is discarded', () => {
  startAttendanceBoot({ pathname: '/', signedIn: true, identity: signedInAs('u1'), load: fakeLoad() });
  assert.equal(takeEarlyAttendance(Date.now() + EARLY_MAX_AGE_MS + 1), null);
});

test('a failed early load is not swallowed into a fake answer (the dashboard reloads normally)', async () => {
  startAttendanceBoot({ pathname: '/', signedIn: true, identity: signedInAs('u1'), load: () => Promise.reject(new Error('network')) });
  await assert.rejects(takeEarlyAttendance(), /network/);
});

test('secondary requests wait for attendance, then go', async () => {
  startAttendanceBoot({ pathname: '/', signedIn: true, identity: signedInAs('u1'), load: fakeLoad(), maxWaitMs: 10_000 });
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
  startAttendanceBoot({ pathname: '/', signedIn: true, identity: signedInAs('u1'), load: () => new Promise(() => {}), maxWaitMs: 30 });
  const t = Date.now();
  await afterAttendance();
  assert.ok(Date.now() - t < 1000);
});

test('no attendance-first start (other pages) → secondary requests are not delayed', async () => {
  const t = Date.now();
  await afterAttendance();
  assert.ok(Date.now() - t < 50);
});
