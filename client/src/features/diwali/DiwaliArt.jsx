import { useId } from 'react';

/**
 * Traditional clay diya with a flickering golden flame (inline SVG + CSS
 * keyframes in styles/index.css → .diwali-*). Decorative unless `title` is given.
 */
export function Diya({ size = 40, lit = true, title, className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`diwali-diya ${lit ? 'is-lit' : ''} ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd56b" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#ffb02e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffb02e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-flame`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff6c9" />
          <stop offset="45%" stopColor="#ffd34d" />
          <stop offset="100%" stopColor="#ff8a1f" />
        </linearGradient>
        <linearGradient id={`${id}-clay`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0a24a" />
          <stop offset="55%" stopColor="#b5651d" />
          <stop offset="100%" stopColor="#7a3b12" />
        </linearGradient>
      </defs>
      {lit && <circle className="diwali-glow" cx="32" cy="26" r="22" fill={`url(#${id}-glow)`} />}
      {/* Bowl */}
      <path d="M8 38 C10 52 22 58 32 58 C42 58 54 52 56 38 Z" fill={`url(#${id}-clay)`} />
      <path d="M8 38 C20 42 44 42 56 38 C50 35 14 35 8 38 Z" fill="#f3c46b" />
      <path d="M14 46 C22 50 42 50 50 46" fill="none" stroke="#f7d58c" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <circle cx="22" cy="49" r="1.3" fill="#f7d58c" />
      <circle cx="32" cy="51" r="1.3" fill="#f7d58c" />
      <circle cx="42" cy="49" r="1.3" fill="#f7d58c" />
      {/* Wick */}
      <path d="M32 37 L32 31" stroke="#5a3415" strokeWidth="1.6" strokeLinecap="round" />
      {lit && (
        <g className="diwali-flame">
          <path d="M32 8 C38 17 40 23 40 27 C40 32 36.5 35 32 35 C27.5 35 24 32 24 27 C24 22 27 17 32 8 Z" fill={`url(#${id}-flame)`} />
          <path d="M32 19 C35 24 36 27 36 29 C36 31.5 34.2 33 32 33 C29.8 33 28 31.5 28 29 C28 26.5 29.5 23.5 32 19 Z" fill="#fffbe8" opacity="0.9" />
        </g>
      )}
    </svg>
  );
}

/** Gold rangoli / mandala, drawn once and reused in the header corners. */
export function Rangoli({ size = 64, className = '' }) {
  const petals = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="#c9972f" strokeWidth="1.2">
        <circle r="46" strokeOpacity="0.45" strokeDasharray="2 3" />
        <circle r="38" strokeOpacity="0.6" />
        {petals.map((a) => (
          <path key={`p${a}`} d="M0 -36 C9 -26 9 -16 0 -10 C-9 -16 -9 -26 0 -36 Z" transform={`rotate(${a})`} fill="#f1d58a" fillOpacity="0.35" />
        ))}
        {petals.map((a) => (
          <path key={`q${a}`} d="M0 -24 C5 -19 5 -14 0 -11 C-5 -14 -5 -19 0 -24 Z" transform={`rotate(${a + 22.5})`} fill="#fbeed0" fillOpacity="0.6" />
        ))}
        <circle r="9" fill="#f1d58a" fillOpacity="0.5" />
        <circle r="4" fill="#c9972f" fillOpacity="0.7" stroke="none" />
      </g>
      {petals.map((a) => (
        <circle key={`d${a}`} cx="0" cy="-42" r="1.8" fill="#c9972f" fillOpacity="0.7" transform={`rotate(${a})`} />
      ))}
    </svg>
  );
}

// Fixed positions (percent of the header) — no per-frame JavaScript at all.
const SPARKLES = [
  { top: '14%', left: '30%', delay: '0s', size: 6 },
  { top: '70%', left: '22%', delay: '1.1s', size: 5 },
  { top: '22%', left: '58%', delay: '2.2s', size: 7 },
  { top: '78%', left: '48%', delay: '0.6s', size: 5 },
  { top: '12%', left: '84%', delay: '1.7s', size: 6 },
  { top: '84%', left: '76%', delay: '2.8s', size: 5 },
  { top: '46%', left: '93%', delay: '3.3s', size: 4 },
  { top: '40%', left: '6%', delay: '0.3s', size: 4 },
];

/**
 * Rangoli corners + 8 CSS sparkles for a header card. Purely decorative:
 * behind the content, never clickable, hidden from screen readers.
 */
export function DiwaliHeaderDecor({ tone = 'light' }) {
  return (
    <div className={`diwali-decor pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit] ${tone === 'dark' ? 'is-dark' : ''}`} aria-hidden="true">
      <Rangoli size={64} className="absolute -top-8 -left-8 opacity-80" />
      <Rangoli size={64} className="absolute -bottom-8 -right-8 opacity-80" />
      {SPARKLES.map((s, i) => (
        <span key={i} className="diwali-sparkle absolute" style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }} />
      ))}
    </div>
  );
}
