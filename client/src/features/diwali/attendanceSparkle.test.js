import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPARKLE_KINDS, sparkleParticles } from './attendanceSparkle.js';

test('each action: 8–15 particles, 500–900 ms; check-out is the biggest', () => {
  for (const [kind, cfg] of Object.entries(SPARKLE_KINDS)) {
    const ps = sparkleParticles(kind, 42);
    assert.ok(ps.length >= 8 && ps.length <= 15, kind);
    assert.ok(cfg.duration >= 500 && cfg.duration <= 900, kind);
  }
  const reach = (k) => Math.max(...sparkleParticles(k, 7).map((p) => Math.hypot(p.dx, p.dy)));
  assert.ok(SPARKLE_KINDS.checkOut.count >= SPARKLE_KINDS.checkIn.count);
  assert.ok(reach('checkOut') > reach('startBreak'));
});

test('unknown kinds draw nothing; the same seed is stable', () => {
  assert.deepEqual(sparkleParticles('nope'), []);
  assert.deepEqual(sparkleParticles('checkIn', 5), sparkleParticles('checkIn', 5));
});
