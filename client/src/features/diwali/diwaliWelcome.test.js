import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPlayWelcome, markWelcomePlayed } from './diwaliConfig.js';

// Minimal browser stand-ins: one tab's sessionStorage + the reduced-motion query.
let store;
let reduced;
beforeEach(() => {
  store = new Map();
  reduced = false;
  globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  globalThis.window = { matchMedia: () => ({ matches: reduced }) };
});
const ist = (s) => new Date(`${s}+05:30`);

test('plays once per tab during Diwali; a refresh (same sessionStorage) does not replay', () => {
  assert.equal(shouldPlayWelcome(ist('2026-11-07T10:00:00')), true);
  markWelcomePlayed();
  assert.equal(shouldPlayWelcome(ist('2026-11-07T10:05:00')), false);
  store = new Map(); // a new tab starts with empty sessionStorage
  assert.equal(shouldPlayWelcome(ist('2026-11-07T10:06:00')), true);
});

test('never outside 6–10 Nov 2026 (India time), and never with reduced motion', () => {
  assert.equal(shouldPlayWelcome(ist('2026-11-05T23:59:00')), false);
  assert.equal(shouldPlayWelcome(ist('2026-11-11T00:00:00')), false);
  reduced = true;
  assert.equal(shouldPlayWelcome(ist('2026-11-08T12:00:00')), false);
});

test('blocked storage fails safe (no replay on every page)', () => {
  globalThis.sessionStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(shouldPlayWelcome(ist('2026-11-08T12:00:00')), false);
});
