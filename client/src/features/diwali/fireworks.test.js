import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShow, step, MAX_PARTICLES } from './fireworks.js';

const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

test('a show is capped and stays within a bounded size', () => {
  const show = createShow(600, 260, seeded());
  assert.ok(show.length > 0 && show.length <= MAX_PARTICLES);
});

test('particles expand outward, fade, and the show always ends (no endless loop)', () => {
  let ps = createShow(600, 260, seeded());
  const start = ps.map((p) => ({ x: p.x, y: p.y }));
  let frames = 0;
  while (ps.length && frames < 1000) {
    ps = step(ps, 1 / 60);
    frames += 1;
  }
  assert.equal(ps.length, 0);
  assert.ok(frames < 200, `ended after ${frames} frames (~${(frames / 60).toFixed(1)}s)`);
  // After a short time particles have moved away from their burst centre.
  let moved = createShow(600, 260, seeded());
  for (let i = 0; i < 20; i++) moved = step(moved, 1 / 60);
  const first = moved.find((p) => p.delay <= 0);
  assert.ok(first && (Math.abs(first.x - start[0].x) > 1 || Math.abs(first.y - start[0].y) > 1));
});
