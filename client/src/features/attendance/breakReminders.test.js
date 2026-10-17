import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  BREAK_REMINDER as R,
  createBreakReminderScheduler,
  createDeliveryStore,
  getActiveBreakSession,
  dueReminder,
  breakAllowanceUsage,
  playReminderSound,
  vibrateForReminder,
  showSystemNotification,
} from './breakReminders.js';

const MIN = 60_000;
const T0 = Date.parse('2026-10-17T13:00:00+05:30'); // break start

function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const onBreak = (startMs = T0) => ({
  checkIn: { timestamp: new Date(startMs - 3.5 * 60 * MIN).toISOString() },
  checkOut: null,
  breaks: [{ type: 'TEA', startTime: new Date(startMs).toISOString(), endTime: null, durationMinutes: 0 }],
});
const withNewBreak = (rec, startMs) => ({ ...rec, breaks: [...rec.breaks, { type: 'TEA', startTime: new Date(startMs).toISOString(), endTime: null, durationMinutes: 0 }] });
const completed = (startMs, minutes) => ({ type: 'TEA', startTime: new Date(startMs).toISOString(), endTime: new Date(startMs + minutes * MIN).toISOString(), durationMinutes: minutes });
/** A record whose earlier breaks are `prior` (minutes each) and whose last break starts at T0. */
const dayWith = (...prior) => ({
  checkIn: { timestamp: new Date(T0 - 4 * 60 * MIN).toISOString() },
  checkOut: null,
  breaks: [...prior.map((m, i) => completed(T0 - (3 * 60 - i * 70) * MIN, m)), { type: 'TEA', startTime: new Date(T0).toISOString(), endTime: null, durationMinutes: 0 }],
});
const ended = (rec, endMs) => ({ ...rec, breaks: rec.breaks.map((b, i, a) => (i === a.length - 1 ? { ...b, endTime: new Date(endMs).toISOString() } : b)) });

let fired;
let storage;
const make = (opts = {}) =>
  createBreakReminderScheduler({ userId: 'u1', store: createDeliveryStore(storage), onReminder: (t) => fired.push(t), ...opts });
const advance = (ms) => mock.timers.tick(ms);

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  fired = [];
  storage = memoryStorage();
});
afterEach(() => mock.timers.reset());

test('1–2. active break: warning at 55 min, "time over" at 60 min, nothing before', () => {
  const s = make();
  s.update(onBreak());
  advance(54 * MIN);
  assert.deepEqual(fired, []);
  advance(1 * MIN + 1000);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  advance(4 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  advance(1 * MIN + 1000);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
  advance(120 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER], 'no repeats, no endless alarm');
  assert.equal(s.pending, false);
});

test('3. ending the break before 55 min cancels both reminders', () => {
  const inactive = [];
  const s = make({ onBreakInactive: () => inactive.push(1) });
  const rec = onBreak();
  s.update(rec);
  advance(30 * MIN);
  s.update(ended(rec, Date.now()));
  assert.equal(s.pending, false);
  advance(90 * MIN);
  assert.deepEqual(fired, []);
  assert.equal(inactive.length, 1);
});

test('4. ending the break between 55 and 60 min cancels the second reminder', () => {
  const s = make();
  const rec = onBreak();
  s.update(rec);
  advance(57 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  s.update(ended(rec, Date.now()));
  advance(30 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON]);
});

test('5. refresh mid-break schedules from the server start time, not from page load', () => {
  advance(40 * MIN); // page (re)loads 40 min into the break
  const s = make();
  s.update(onBreak());
  advance(14 * MIN);
  assert.deepEqual(fired, []);
  advance(1 * MIN + 1000); // 55 min after the real start, i.e. 15 min after load
  assert.deepEqual(fired, [R.ENDING_SOON]);
});

test('6. refresh after a reminder was shown does not show it again in the same break', () => {
  let s = make();
  s.update(onBreak());
  advance(56 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  s.stop(); // page refresh / tab reload
  s = make();
  s.update(onBreak());
  assert.deepEqual(fired, [R.ENDING_SOON]);
  advance(5 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
  s.stop();
  s = make();
  s.update(onBreak());
  advance(30 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
});

test('6b. arriving after 60 min shows only "time over" once (stale 55-min warning is skipped)', () => {
  advance(75 * MIN);
  const s = make();
  s.update(onBreak());
  assert.deepEqual(fired, [R.TIME_OVER]);
  s.check();
  assert.deepEqual(fired, [R.TIME_OVER]);
});

test('7. a new break does not inherit reminder state from the previous break (allowance carries over, deliveries do not)', () => {
  const s = make();
  const first = onBreak();
  s.update(first);
  advance(20 * MIN);
  const afterFirst = ended(first, Date.now()); // 20 min used
  s.update(afterFirst);
  advance(60 * MIN);
  const secondStart = Date.now();
  s.update(withNewBreak(afterFirst, secondStart)); // 40 min left
  advance(34 * MIN);
  assert.deepEqual(fired, [], 'no stale reminder; warning not before 35 min');
  advance(1 * MIN + 1000);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  advance(5 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
  // old break's delivery records were pruned
  assert.ok(Object.keys(storage.dump()).every((k) => k.includes(new Date(secondStart).toISOString())));
});

test('8. repeated updates (re-renders / refetches) never duplicate timers or alerts', () => {
  let created = 0;
  const s = make({ setTimer: (fn, ms) => { created += 1; return setTimeout(fn, ms); } });
  for (let i = 0; i < 50; i += 1) s.update(onBreak());
  assert.equal(created, 1);
  advance(56 * MIN);
  for (let i = 0; i < 50; i += 1) { s.update(onBreak()); s.check(); }
  assert.deepEqual(fired, [R.ENDING_SOON]);
});

test('9. background-tab throttling: a late timer is caught up by check() on visibility', () => {
  // Simulate a throttled tab: timers never fire, only the clock moves.
  const s = make({ setTimer: () => 1, clearTimer: () => {} });
  s.update(onBreak());
  mock.timers.setTime(T0 + 58 * MIN);
  assert.deepEqual(fired, []);
  s.check(); // visibilitychange → visible
  assert.deepEqual(fired, [R.ENDING_SOON]);
  mock.timers.setTime(T0 + 80 * MIN);
  s.check();
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
});

test('9b. a stale timer never fires after the break has ended', () => {
  const s = make();
  const rec = onBreak();
  s.update(rec);
  advance(54 * MIN);
  s.update(ended(rec, Date.now()));
  s.check(); // e.g. visibility event right after
  advance(10 * MIN);
  assert.deepEqual(fired, []);
});

test('10. missing / invalid data never throws and never reminds', () => {
  const s = make();
  for (const rec of [null, undefined, {}, { checkIn: null }, { checkIn: {}, breaks: null }, { checkIn: {}, breaks: [{ startTime: 'garbage' }] }, { checkIn: {}, breaks: [{}] }, { checkIn: {}, checkOut: {}, breaks: [{ startTime: new Date(T0).toISOString() }] }]) {
    assert.doesNotThrow(() => s.update(rec));
  }
  advance(120 * MIN);
  assert.deepEqual(fired, []);
  assert.equal(getActiveBreakSession({ checkIn: {}, breaks: [{ startTime: 'x' }] }), null);
  assert.equal(dueReminder(getActiveBreakSession(onBreak()), T0 - 5 * MIN), null); // clock skew: break "in the future"
});

test('10b. storage that throws (private mode / blocked) still dedupes within the session', () => {
  const broken = { get length() { throw new Error('blocked'); }, key() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const s = createBreakReminderScheduler({ userId: 'u1', store: createDeliveryStore(broken), onReminder: (t) => fired.push(t) });
  s.update(onBreak());
  advance(56 * MIN);
  s.check();
  s.update(onBreak());
  assert.deepEqual(fired, [R.ENDING_SOON]);
});

test('11. unsupported vibration, denied notifications and blocked audio are harmless', () => {
  assert.equal(vibrateForReminder(R.ENDING_SOON, {}), false);
  assert.equal(vibrateForReminder(R.ENDING_SOON, { vibrate() { throw new Error('nope'); } }), false);
  const pattern = [];
  vibrateForReminder(R.TIME_OVER, { vibrate: (p) => { pattern.push(p); return true; } });
  vibrateForReminder(R.ENDING_SOON, { vibrate: (p) => { pattern.push(p); return true; } });
  assert.notDeepEqual(pattern[0], pattern[1], 'distinct patterns');

  let constructed = 0;
  const N = function () { constructed += 1; };
  N.permission = 'denied';
  assert.equal(showSystemNotification('t', 'b', { Notification: N }), false);
  N.permission = 'default';
  assert.equal(showSystemNotification('t', 'b', { Notification: N }), false, 'never prompts');
  assert.equal(constructed, 0);
  assert.equal(showSystemNotification('t', 'b', {}), false);

  assert.equal(playReminderSound(R.ENDING_SOON, {}), false);
  assert.equal(playReminderSound(R.ENDING_SOON, { AudioContext: function () { throw new Error('NotAllowedError'); } }), false);
});

test('12. reminders never touch the attendance record; the break stays open until the employee ends it', () => {
  const rec = onBreak();
  const before = JSON.stringify(rec);
  const s = make();
  s.update(rec);
  advance(3 * 60 * MIN);
  assert.equal(JSON.stringify(rec), before);
  assert.equal(rec.breaks[0].endTime, null);
  // the manual End Break result is still accepted normally
  s.update(ended(rec, Date.now()));
  assert.equal(s.pending, false);
});

test('logout / user change: stop() cancels everything', () => {
  const s = make();
  s.update(onBreak());
  s.stop();
  advance(120 * MIN);
  s.update(onBreak());
  assert.deepEqual(fired, []);
});

// ---- Shared daily allowance (60 min across all breaks) ----

test('allowance math is the End Break countdown: completed (end − start) + active elapsed, never negative', () => {
  const rec = dayWith(20, 15);
  assert.deepEqual(
    { ...breakAllowanceUsage(rec, T0 + 10 * MIN, 60) },
    { allowanceMs: 60 * MIN, completedMs: 35 * MIN, activeMs: 10 * MIN, usedMs: 45 * MIN, remainingMs: 15 * MIN }
  );
  assert.equal(breakAllowanceUsage(dayWith(50, 30), T0 + 5 * MIN, 60).remainingMs, 0, 'exceeded → 0, not negative');
  assert.equal(breakAllowanceUsage(null, T0).usedMs, 0);
  assert.equal(breakAllowanceUsage({ breaks: [{ startTime: 'x', endTime: 'y' }] }, T0).usedMs, 0);
  assert.equal(breakAllowanceUsage(dayWith(), T0 + 5 * MIN, undefined).allowanceMs, 60 * MIN, 'defaults to 60 min');
});

test('partial prior break: 20 min used earlier → warning at 35 min, over at 40 min into this break', () => {
  const s = make();
  s.update(dayWith(20));
  advance(34 * MIN);
  assert.deepEqual(fired, []);
  advance(1 * MIN + 1000);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  advance(4 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  advance(1 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
});

test('multiple prior breaks are all counted: 15 + 10 + 20 used → 15 min left', () => {
  const s = make();
  s.update(dayWith(15, 10, 20));
  advance(9 * MIN);
  assert.deepEqual(fired, []);
  advance(1 * MIN + 1000);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  advance(5 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
});

test('starting a break with ≤ 5 min left shows the warning immediately, with the real minutes left', () => {
  const details = [];
  const s = make({ onReminder: (t, d) => { fired.push(t); details.push(d); } });
  s.update(dayWith(57)); // 3 min left
  assert.deepEqual(fired, [R.ENDING_SOON]);
  assert.equal(details[0].remainingMs, 3 * MIN);
  advance(3 * MIN + 1000);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
});

test('starting a break with exactly 5 min left warns immediately', () => {
  const s = make();
  s.update(dayWith(55));
  assert.deepEqual(fired, [R.ENDING_SOON]);
});

test('starting a break after the allowance is used up shows only "time over", immediately and once', () => {
  const details = [];
  const s = make({ onReminder: (t, d) => { fired.push(t); details.push(d); } });
  s.update(dayWith(40, 30)); // 70 min used — already exceeded
  assert.deepEqual(fired, [R.TIME_OVER]);
  assert.equal(details[0].remainingMs, 0, 'no negative remaining time');
  advance(60 * MIN);
  s.check();
  s.update(dayWith(40, 30));
  assert.deepEqual(fired, [R.TIME_OVER]);
  assert.equal(s.pending, false);
});

test('refresh recovery with prior breaks: reload mid-break keeps the allowance-based schedule', () => {
  advance(20 * MIN); // reload 20 min into a break, 25 min used earlier → 15 min left now
  let s = make();
  s.update(dayWith(25));
  assert.deepEqual(fired, []);
  advance(10 * MIN + 1000);
  assert.deepEqual(fired, [R.ENDING_SOON]);
  s.stop(); // reload again after the warning
  s = make();
  s.update(dayWith(25));
  assert.deepEqual(fired, [R.ENDING_SOON], 'warning not repeated');
  advance(5 * MIN);
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
});

test('duplicate prevention with prior breaks: many updates/checks → one timer, one alert each', () => {
  let created = 0;
  const s = make({ setTimer: (fn, ms) => { created += 1; return setTimeout(fn, ms); } });
  for (let i = 0; i < 30; i += 1) s.update(dayWith(30));
  assert.equal(created, 1);
  advance(26 * MIN);
  for (let i = 0; i < 30; i += 1) { s.update(dayWith(30)); s.check(); }
  advance(5 * MIN);
  for (let i = 0; i < 30; i += 1) { s.update(dayWith(30)); s.check(); }
  assert.deepEqual(fired, [R.ENDING_SOON, R.TIME_OVER]);
});

test('a configured allowance other than 60 is respected (same value as the countdown)', () => {
  const s = make();
  s.update(dayWith(10), 30); // 30-min allowance, 10 used → 20 left
  advance(15 * MIN + 1000);
  assert.deepEqual(fired, [R.ENDING_SOON]);
});
