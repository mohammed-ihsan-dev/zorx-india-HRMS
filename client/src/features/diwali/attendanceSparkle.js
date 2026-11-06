// Per-action recipes for the phone-only Diwali attendance sparkles: a few
// CSS-animated particles (transform + opacity only), no animation loop.
export const SPARKLE_KINDS = Object.freeze({
  checkIn: { count: 12, distance: 46, duration: 700, label: 'Checked in' },
  startBreak: { count: 8, distance: 30, duration: 600, label: 'Break started' },
  endBreak: { count: 10, distance: 38, duration: 650, label: 'Break ended' },
  checkOut: { count: 15, distance: 64, duration: 900, label: 'Checked out' },
});
const COLORS = ['#ffd34d', '#f5c542', '#ffb02e', '#fff1b8', '#ff9a3c'];

/** Deterministic particle list for one burst (seed varies the look between bursts). */
export function sparkleParticles(kind, seed = 1) {
  const cfg = SPARKLE_KINDS[kind];
  if (!cfg) return [];
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: cfg.count }, (_, i) => {
    const angle = (i / cfg.count) * Math.PI * 2 + rand() * 0.5;
    const dist = cfg.distance * (0.65 + rand() * 0.45);
    return {
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.sin(angle) * dist * 0.8), // a little flatter than a circle, around a wide button
      size: i % 4 === 0 ? 7 : 4 + Math.round(rand() * 2),
      star: i % 4 === 0,
      delay: Math.round(rand() * 90),
      color: COLORS[i % COLORS.length],
    };
  });
}
