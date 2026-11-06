import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { markWelcomePlayed, shouldPlayWelcome } from './diwaliConfig.js';

const DiwaliWelcome = lazy(() => import('./DiwaliWelcome.jsx'));

/**
 * Mounted once in each signed-in layout. Decides only after the first render
 * (so the dashboard is never delayed) and downloads the animation only when it
 * will actually play: once per tab, 6–10 Nov 2026 IST, not under reduced motion.
 */
export function DiwaliWelcomeGate() {
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const start = () => {
      if (!shouldPlayWelcome()) return;
      markWelcomePlayed(); // before playing: a refresh mid-show never replays
      setPlay(true);
    };
    const idle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 1200 }) : setTimeout(start, 400);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(idle) : clearTimeout(idle));
  }, []);
  const done = useCallback(() => setPlay(false), []);
  if (!play) return null;
  return (
    <Suspense fallback={null}>
      <DiwaliWelcome onDone={done} />
    </Suspense>
  );
}
