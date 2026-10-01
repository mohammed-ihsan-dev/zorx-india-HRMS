import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePrefersReducedMotion } from '../../hooks/useCountUp.js';
import { GANDHI_JAYANTI_IMAGE_SRC, GANDHI_JAYANTI_MESSAGE } from './gandhiJayantiConfig.js';

// Full timeline ~5s: entrance -> brief float/sparkle hold -> fade out -> unmount.
// (Visual/animation only — trigger, date-gating, and session guard live in the
// caller and in gandhiJayantiConfig.js, both untouched by this file.)
const EXIT_MS = 600;
const TOTAL_MS = 5200;

const SPARK_COLORS = ['#f59e0b', '#84b56e', '#fde68a', '#5a9c48', '#fbbf24', '#22c55e'];

function Firework({ side, top, delayMs, scale = 1 }) {
  const sparkCount = 8;
  const sparks = Array.from({ length: sparkCount }, (_, i) => i);

  return (
    <div
      className={`absolute ${side === 'left' ? '-left-6 sm:-left-16 lg:-left-24' : '-right-6 sm:-right-16 lg:-right-24'} pointer-events-none z-10`}
      style={{ top, transform: `scale(${scale})`, animationDelay: `${delayMs}ms` }}
    >
      {/* Soft central glow flash */}
      <span
        className="gandhi-jayanti-glow absolute left-1/2 top-1/2 w-5 h-5 rounded-full"
        style={{ background: 'radial-gradient(circle, #fef3c7 0%, rgba(253,230,138,0) 70%)', animationDelay: `${delayMs}ms` }}
      />
      {sparks.map((i) => (
        <span
          key={i}
          className="gandhi-jayanti-spark absolute left-1/2 top-1/2 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.9)]"
          style={{
            width: 8,
            height: 8,
            background: SPARK_COLORS[i % SPARK_COLORS.length],
            // CSS rotate+translate trick: rotating the coordinate system first,
            // then translating along its (now-angled) X axis, produces a clean
            // radial burst with no JS trigonometry needed.
            '--gandhi-spark-angle': `${(360 / sparkCount) * i}deg`,
            animationDelay: `${delayMs}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Purely a temporary visual overlay — renders above the page via a portal,
 * reserves no layout space, and leaves nothing behind once dismissed. Does
 * not read or write any attendance/check-in state itself; the caller decides
 * when `open` becomes true (unchanged interface/trigger).
 *
 * All animation is plain CSS (@keyframes scoped to this file via an inline
 * <style> tag) — no animation library, no global stylesheet/Tailwind config
 * changes, nothing added outside this one component.
 */
export function GandhiJayantiCelebration({ open, onDismiss }) {
  const reducedMotion = usePrefersReducedMotion();
  const [closing, setClosing] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) {
      setClosing(false);
      return undefined;
    }
    const closeTimer = setTimeout(() => setClosing(true), TOTAL_MS - EXIT_MS);
    const dismissTimer = setTimeout(() => {
      onDismissRef.current?.();
    }, TOTAL_MS);
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(dismissTimer);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      // pointer-events-none on the whole overlay: this is a celebratory
      // layer, not a modal — Check In / Start Break / Check Out must stay
      // clickable underneath for the full ~5s the celebration is visible.
      className={`fixed inset-0 z-[300] flex items-center justify-center p-6 overflow-hidden pointer-events-none ${
        reducedMotion ? '' : closing ? 'gandhi-jayanti-backdrop-out' : 'gandhi-jayanti-backdrop-in'
      }`}
    >
      <style>{GANDHI_JAYANTI_STYLES}</style>

      {/* Soft, see-through backdrop — the dashboard underneath stays legible
          (and clickable) through it. */}
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[3px]" />

      <div
        className={`relative flex flex-col items-center text-center w-full max-w-[280px] sm:max-w-sm lg:max-w-md ${
          reducedMotion ? '' : closing ? 'gandhi-jayanti-content-out' : ''
        }`}
      >
        {!reducedMotion && (
          <>
            <Firework side="left" top="8%" delayMs={350} scale={1.1} />
            <Firework side="left" top="55%" delayMs={1200} scale={0.85} />
            <Firework side="right" top="12%" delayMs={500} scale={1.1} />
            <Firework side="right" top="50%" delayMs={1400} scale={0.85} />
          </>
        )}

        {/* Two nested elements on purpose: the outer handles the continuous
            float loop, the inner handles the one-shot entrance. Both animate
            `transform`, and two concurrent animations on the SAME element
            fighting over the same property would glitch — splitting them
            across parent/child composes cleanly instead. */}
        <div className={reducedMotion ? '' : 'gandhi-jayanti-float-wrapper'}>
          <img
            src={GANDHI_JAYANTI_IMAGE_SRC}
            alt="Happy Gandhi Jayanti"
            className={`relative block w-[200px] sm:w-[260px] md:w-[300px] lg:w-[340px] h-auto object-contain drop-shadow-2xl ${
              reducedMotion ? 'gandhi-jayanti-image-reduced' : 'gandhi-jayanti-image-in'
            }`}
          />
        </div>

        {/* Natural reflow (no forced <br>) — the container wraps "Happy
            Birthday" / "Gandhiji" onto two lines on mobile on its own, and
            widens enough at sm:/lg: to sit on one. */}
        <p
          className={`relative mt-4 sm:mt-5 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight drop-shadow-lg leading-tight ${
            reducedMotion ? 'gandhi-jayanti-text-reduced' : 'gandhi-jayanti-text-in'
          }`}
        >
          {GANDHI_JAYANTI_MESSAGE}
        </p>
      </div>
    </div>,
    document.body
  );
}

const GANDHI_JAYANTI_STYLES = `
@keyframes gandhi-jayanti-backdrop-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes gandhi-jayanti-backdrop-fade-out { from { opacity: 1; } to { opacity: 0; } }
.gandhi-jayanti-backdrop-in { animation: gandhi-jayanti-backdrop-fade-in 400ms ease-out both; }
.gandhi-jayanti-backdrop-out { animation: gandhi-jayanti-backdrop-fade-out ${EXIT_MS}ms ease-in both; }

@keyframes gandhi-jayanti-image-enter {
  0% { opacity: 0; transform: scale(0.75) translateY(20px); }
  65% { opacity: 1; transform: scale(1.02) translateY(-2px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
.gandhi-jayanti-image-in { opacity: 0; animation: gandhi-jayanti-image-enter 700ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both; }
.gandhi-jayanti-image-reduced { opacity: 1; }

@keyframes gandhi-jayanti-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.gandhi-jayanti-float-wrapper { animation: gandhi-jayanti-float 3.2s ease-in-out 900ms infinite; }

@keyframes gandhi-jayanti-text-enter {
  0% { opacity: 0; transform: translateY(15px); }
  100% { opacity: 1; transform: translateY(0); }
}
.gandhi-jayanti-text-in { opacity: 0; animation: gandhi-jayanti-text-enter 550ms ease-out 700ms both; }
.gandhi-jayanti-text-reduced { opacity: 1; }

@keyframes gandhi-jayanti-content-fade-out {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.96); }
}
.gandhi-jayanti-content-out { animation: gandhi-jayanti-content-fade-out ${EXIT_MS}ms ease-in both; }

@keyframes gandhi-jayanti-glow-pulse {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
  30% { opacity: 1; transform: translate(-50%, -50%) scale(3.4); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(4.2); }
}
.gandhi-jayanti-glow { opacity: 0; animation: gandhi-jayanti-glow-pulse 950ms ease-out both; }

@keyframes gandhi-jayanti-spark-burst {
  0% { opacity: 1; transform: translate(-50%, -50%) rotate(var(--gandhi-spark-angle)) translateX(0) scale(1); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--gandhi-spark-angle)) translateX(56px) scale(0.3); }
}
.gandhi-jayanti-spark { opacity: 0; animation: gandhi-jayanti-spark-burst 950ms ease-out both; }
`;
