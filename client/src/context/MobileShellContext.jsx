import { createContext, useContext, useEffect, useState } from 'react';

// Mobile = below Tailwind's `md` (768px). Tablet (md) and desktop keep the
// original layout untouched.
export const MOBILE_QUERY = '(max-width: 767.98px)';

const MobileShellContext = createContext(false);

/** Live media-query match; re-renders on resize/rotation. */
export function useMediaQuery(query) {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

export function MobileShellProvider({ active, children }) {
  return <MobileShellContext.Provider value={active}>{children}</MobileShellContext.Provider>;
}

/**
 * True only inside the employee layout on a phone-sized screen. Pages use it to
 * render their compact mobile view instead of (not on top of) the original one,
 * so data is fetched once and admin layouts are never affected.
 */
export function useMobileShell() {
  return useContext(MobileShellContext);
}
