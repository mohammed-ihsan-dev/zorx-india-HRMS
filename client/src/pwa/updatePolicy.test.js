import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, isNewBuild, formatVersion, unsafeReason, shouldAutoApply, singleFlight, RETRY_GUARD_MS, IDLE_BEFORE_APPLY_MS } from './updatePolicy.js';
import { beginSave, endSave, getUpdateSafety, _resetUpdateGuard } from './updateGuard.js';

test('manifest validation never trusts a malformed response', () => {
  assert.deepEqual(parseManifest({ version: '2.0.0', build: 'abc1234', builtAt: '2026-10-27T10:00:00Z' }), { version: '2.0.0', build: 'abc1234', builtAt: '2026-10-27T10:00:00Z' });
  assert.equal(parseManifest(null), null);
  assert.equal(parseManifest('<!doctype html>'), null); // SPA fallback page
  assert.equal(parseManifest({ version: '2.0.0' }), null);
  assert.equal(parseManifest({ version: '', build: 'x' }), null);
});

test('a new build is detected only when the deployed build differs', () => {
  assert.equal(isNewBuild('abc1234', { build: 'abc1234' }), false);
  assert.equal(isNewBuild('abc1234', { build: 'def5678' }), true);
  assert.equal(isNewBuild('abc1234', null), false); // a failed check never claims an update
  assert.equal(formatVersion('2.0.0', 'abc1234'), '2.0.0 (abc1234)');
});

test('unsafe while saving, in a dialog, with unsubmitted input, or just after interaction', () => {
  assert.equal(unsafeReason({ pendingSaves: 1 }), 'saving');
  assert.equal(unsafeReason({ dialogOpen: true }), 'dialog');
  assert.equal(unsafeReason({ unsavedInput: true }), 'unsaved');
  assert.equal(unsafeReason({ msSinceInteraction: IDLE_BEFORE_APPLY_MS - 1 }), 'active');
  assert.equal(unsafeReason({ msSinceInteraction: IDLE_BEFORE_APPLY_MS }), null);
  assert.equal(unsafeReason({}), null);
});

test('auto-apply: only when ready and safe, not snoozed, and never twice for one build in the guard window', () => {
  const base = { pending: true, unsafe: false, targetBuild: 'b2', now: 1_000_000 };
  assert.equal(shouldAutoApply(base), true);
  assert.equal(shouldAutoApply({ ...base, pending: false }), false); // up to date → no reload
  assert.equal(shouldAutoApply({ ...base, unsafe: true }), false);
  assert.equal(shouldAutoApply({ ...base, snoozedUntil: base.now + 1 }), false);
  assert.equal(shouldAutoApply({ ...base, lastAttempt: { build: 'b2', at: base.now - 1000 } }), false); // loop guard
  assert.equal(shouldAutoApply({ ...base, lastAttempt: { build: 'b2', at: base.now - RETRY_GUARD_MS } }), true);
  assert.equal(shouldAutoApply({ ...base, lastAttempt: { build: 'b1', at: base.now - 1000 } }), true); // a newer build
});

test('single-flight: repeated taps share one check; a new one starts after it finishes', async () => {
  let runs = 0;
  let release;
  const check = singleFlight(() => {
    runs += 1;
    return new Promise((r) => (release = r));
  });
  const a = check();
  const b = check();
  const c = check();
  await Promise.resolve();
  assert.equal(runs, 1);
  release('v');
  assert.deepEqual(await Promise.all([a, b, c]), ['v', 'v', 'v']);
  check();
  await Promise.resolve();
  assert.equal(runs, 2);
});

test('single-flight: a failed check rejects every waiter and allows a retry', async () => {
  let runs = 0;
  const check = singleFlight(async () => {
    runs += 1;
    if (runs === 1) throw new Error('offline');
    return 'ok';
  });
  await assert.rejects(Promise.all([check(), check()]), /offline/);
  assert.equal(await check(), 'ok');
  assert.equal(runs, 2);
});

test('the guard counts in-flight saves and open dialogs', () => {
  _resetUpdateGuard();
  const doc = { activeElement: null, querySelector: (sel) => (sel === '[data-zm-modal]' ? doc.modal : null), modal: null };
  beginSave();
  beginSave();
  assert.equal(getUpdateSafety(doc, 1e12).pendingSaves, 2);
  endSave();
  endSave();
  endSave(); // never below zero
  assert.equal(getUpdateSafety(doc, 1e12).pendingSaves, 0);
  doc.modal = {};
  assert.equal(getUpdateSafety(doc, 1e12).dialogOpen, true);
});
