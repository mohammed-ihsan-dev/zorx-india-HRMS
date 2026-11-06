// Tiny fireworks engine for the Diwali mini-game: plain objects, a hard
// particle cap, and a step function with no DOM or React — so the canvas loop
// only draws, and the logic is unit-testable.

export const COLORS = ['#ffd34d', '#ffb02e', '#ff8a1f', '#fff1b8', '#f5c542', '#ff6b4a', '#ffe08a'];
export const MAX_PARTICLES = 160;
export const BURSTS = 3;
export const PARTICLES_PER_BURST = 40;
const GRAVITY = 60; // px/s²
const DRAG = 0.985;

/** One radial burst at (x, y). `rand` is injectable for tests. */
export function createBurst(x, y, rand = Math.random, count = PARTICLES_PER_BURST) {
  const color = COLORS[Math.floor(rand() * COLORS.length)];
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.2;
    const speed = 70 + rand() * 90;
    const life = 1.1 + rand() * 0.6;
    const sparkle = i % 5 === 0;
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, ttl: life, size: sparkle ? 3.2 : 2.4, color: sparkle ? '#fff6cf' : color };
  });
}

/**
 * A whole show for a stage of width × height: a few bursts, capped at
 * MAX_PARTICLES. `gap` = seconds between bursts; `top`/`band` = vertical
 * range (fractions of height) where bursts explode.
 */
export function createShow(width, height, rand = Math.random, { bursts = BURSTS, gap = 0.35, perBurst = PARTICLES_PER_BURST, top = 0.25, band = 0.3 } = {}) {
  const out = [];
  for (let b = 0; b < bursts; b++) {
    const x = width * (0.15 + 0.7 * rand());
    const y = height * (top + band * rand());
    // Later bursts start later (a positive delay = waiting to explode).
    for (const p of createBurst(x, y, rand, Math.min(perBurst, PARTICLES_PER_BURST))) out.push({ ...p, delay: b * gap });
  }
  return out.slice(0, MAX_PARTICLES);
}

/** The automatic welcome show: 4 bursts of ≤40 across the top, ~3.5 s in total. */
export const WELCOME_SHOW = Object.freeze({ bursts: 4, gap: 0.55, perBurst: 36, top: 0.18, band: 0.4 });

/** Advances in place; returns the particles still alive. */
export function step(particles, dt) {
  const alive = [];
  for (const p of particles) {
    if (p.delay > 0) {
      p.delay -= dt;
      alive.push(p);
      continue;
    }
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vx *= DRAG;
    p.vy = p.vy * DRAG + GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    alive.push(p);
  }
  return alive;
}
