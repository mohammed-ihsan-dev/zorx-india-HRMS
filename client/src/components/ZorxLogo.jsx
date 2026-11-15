import { useState } from 'react';

/**
 * ZorxLogo — the official ZORX INDIA logo (Nov 2026 identity).
 *
 * Props:
 * - variant: 'black' (default, for light backgrounds) | 'white' (for dark backgrounds).
 *            'green' is accepted as an alias of 'black' for older call sites.
 * - size: 'sm' | 'md' | 'lg' | 'xl' | 'sidebar' | 'navbar' | 'login'
 * - className: extra CSS classes
 * - showTagline: show the full logo with "INTERACTIVE AGENCY" (default true). Compact
 *   header sizes ('sm', 'navbar') always use the mark without the tagline, which keeps
 *   those headers the same height as before.
 *
 * Assets: public/assets/zorx-logo-{black,white}[-without-text].{webp,png} — the
 * supplied files (PNG, 1920px) plus 800px WebP copies. Proportions are never changed
 * (width-driven, height auto).
 */
const COMPACT_SIZES = new Set(['sm', 'navbar']);
const DIMENSIONS = { full: { width: 800, height: 333 }, mark: { width: 800, height: 258 } };

export function ZorxLogo({ variant = 'black', size = 'md', className = '', showTagline = true }) {
  const color = variant === 'white' ? 'white' : 'black';
  const withText = showTagline && !COMPACT_SIZES.has(size);
  const base = `/assets/zorx-logo-${color}${withText ? '' : '-without-text'}`;
  // Small WebP first, then the supplied PNG of the same logo (never an old logo).
  const sources = [`${base}.webp`, `${base}.png`];
  const [srcIndex, setSrcIndex] = useState(0);
  const { width, height } = DIMENSIONS[withText ? 'full' : 'mark'];

  const sizeStyles = {
    sm: 'w-28 sm:w-32',
    md: 'w-36 sm:w-44',
    lg: 'w-48 sm:w-56',
    xl: 'w-60 sm:w-72',
    navbar: 'w-36 sm:w-44',
    sidebar: 'w-36 sm:w-40', // full logo is taller (2.4:1): same header height as before
    login: 'w-56 sm:w-64',
  }[size] || 'w-40';

  return (
    <div className={`inline-flex items-center shrink-0 ${sizeStyles} ${className}`}>
      <img
        key={base}
        src={sources[srcIndex]}
        alt="ZORX India"
        width={width}
        height={height}
        decoding="async"
        onError={() => srcIndex < sources.length - 1 && setSrcIndex(srcIndex + 1)}
        className="w-full h-auto object-contain block"
      />
    </div>
  );
}
