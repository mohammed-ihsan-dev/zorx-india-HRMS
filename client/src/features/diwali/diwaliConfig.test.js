import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDiwaliActive, indiaDateKey, msUntilNextIndiaMidnight } from './diwaliConfig.js';

const ist = (s) => new Date(`${s}+05:30`);

test('active 6–10 November 2026 (India time), inclusive', () => {
  assert.equal(isDiwaliActive(ist('2026-11-05T23:59:59')), false);
  for (const d of ['06', '07', '08', '09', '10']) {
    assert.equal(isDiwaliActive(ist(`2026-11-${d}T00:00:00`)), true, d);
    assert.equal(isDiwaliActive(ist(`2026-11-${d}T23:59:59`)), true, d);
  }
  assert.equal(isDiwaliActive(ist('2026-11-11T00:00:00')), false);
  assert.equal(isDiwaliActive(ist('2026-12-25T12:00:00')), false);
  assert.equal(isDiwaliActive(ist('2027-11-08T12:00:00')), false); // never again in later years
});

test('India time decides, not UTC or the viewer: 10 Nov 18:30 UTC is already 11 Nov in India', () => {
  assert.equal(indiaDateKey(new Date('2026-11-10T18:29:59Z')), '2026-11-10');
  assert.equal(isDiwaliActive(new Date('2026-11-10T18:29:59Z')), true);
  assert.equal(isDiwaliActive(new Date('2026-11-10T18:30:00Z')), false);
  assert.equal(isDiwaliActive(new Date('2026-11-05T18:30:00Z')), true); // 6 Nov 00:00 IST (5 Nov 22:30 in Dubai)
});

test('the next re-check is at India midnight', () => {
  assert.equal(msUntilNextIndiaMidnight(ist('2026-11-10T23:00:00')), 3600000);
  assert.equal(msUntilNextIndiaMidnight(ist('2026-11-10T00:00:00')), 86400000);
});
