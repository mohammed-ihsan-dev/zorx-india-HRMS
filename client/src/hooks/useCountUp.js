import { useEffect, useState } from 'react';

/**
 * useCountUp Hook
 * Visibly animates a number from 0 to endValue using requestAnimationFrame with ease-out quad timing.
 * Resets to 0 and counts up to endValue whenever endValue changes.
 * Respects system prefers-reduced-motion preference.
 */
export function useCountUp(endValue, duration = 600) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const isReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const numValue = typeof endValue === 'number' ? endValue : parseFloat(endValue) || 0;

    if (isReducedMotion) {
      setCount(numValue);
      return;
    }

    if (numValue === 0) {
      setCount(0);
      return;
    }

    // Reset count to 0 so the count-up is visually triggered every time endValue updates
    setCount(0);

    let startTimestamp = null;
    let animationFrameId = null;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easedProgress = 1 - (1 - progress) * (1 - progress);
      const current = Math.round(easedProgress * numValue);
      setCount(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    // Delay start by 16ms frame to guarantee initial 0 render state
    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [endValue, duration]);

  return count;
}

/**
 * usePrefersReducedMotion Hook
 * Detects system reduced motion preference cleanly.
 */
export function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const listener = (e) => setReducedMotion(e.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', listener);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(listener);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', listener);
      } else if (mediaQuery.removeListener) {
        mediaQuery.removeListener(listener);
      }
    };
  }, []);

  return reducedMotion;
}
