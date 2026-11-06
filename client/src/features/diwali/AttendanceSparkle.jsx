import { useEffect, useMemo } from 'react';
import { SPARKLE_KINDS, sparkleParticles } from './attendanceSparkle.js';

/**
 * One short burst centred on the attendance action area (phone dashboard only).
 * Render with a fresh `key` per success: a new burst replaces the old one, so
 * they never pile up. Purely decorative: no pointer events, removed after it ends.
 */
export function AttendanceSparkle({ kind, seed, onDone }) {
  const cfg = SPARKLE_KINDS[kind];
  const particles = useMemo(() => sparkleParticles(kind, seed), [kind, seed]);
  useEffect(() => {
    if (!cfg) return undefined;
    const id = setTimeout(onDone, cfg.duration + 150);
    return () => clearTimeout(id);
  }, [cfg, onDone]);
  if (!cfg) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden="true" data-diwali-sparkle={kind}>
      <span className="diwali-burst-glow absolute left-1/2 top-1/2" style={{ animationDuration: `${cfg.duration}ms` }} />
      {particles.map((p, i) => (
        <span
          key={i}
          className={`diwali-burst-dot absolute left-1/2 top-1/2 ${p.star ? 'is-star' : ''}`}
          style={{
            width: p.size,
            height: p.size,
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            background: p.star ? undefined : p.color,
            animationDuration: `${cfg.duration}ms`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
