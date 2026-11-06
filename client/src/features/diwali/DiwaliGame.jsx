import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Diya } from './DiwaliArt.jsx';
import { RocketLauncher } from './RocketLauncher.jsx';

const DIYA_COUNT = 5; // small fixed limit: no unbounded DOM or animations

/**
 * "Light Up the Celebration!" — lazy-loaded festive overlay (DiwaliBanner).
 * Local state only; no API, storage or audio. The rocket game's animation
 * runs only during a launch and is cancelled on close (RocketLauncher).
 */
export default function DiwaliGame({ onClose }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const [lit, setLit] = useState(() => Array(DIYA_COUNT).fill(false));
  const [lastLit, setLastLit] = useState(-1);
  const litCount = lit.filter(Boolean).length;

  // Focus: into the dialog on open, back to the opener on close. Escape + Tab trap.
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll('button:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [onClose]);

  const lightDiya = (i) => {
    if (lit[i]) return;
    setLit((prev) => prev.map((v, j) => (j === i ? true : v)));
    setLastLit(i);
  };


  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-[#0d2417]/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg max-h-full overflow-y-auto rounded-3xl border border-[#c9972f]/50 bg-gradient-to-b from-[#0d2417] via-[#173d29] to-[#1f5138] text-[#fbeed0] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 id={titleId} className="text-xl sm:text-2xl font-extrabold text-[#f7d58c]">
              Light Up the Celebration!
            </h2>
            <p className="text-sm text-[#e0efdf] mt-1">Celebrate the festival of lights with ZORX INDIA.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-[#c9972f]/50 text-sm font-semibold text-[#f7d58c] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c]"
          >
            <X size={16} aria-hidden="true" /> Close
          </button>
        </div>

        {/* A. Light a Diya */}
        <section aria-labelledby={`${titleId}-diyas`} className="px-5 pt-5">
          <h3 id={`${titleId}-diyas`} className="text-sm font-bold uppercase tracking-wider text-[#f1d58a]">
            Light a Diya <span className="font-semibold normal-case tracking-normal text-[#e0efdf]/80">· {litCount}/{DIYA_COUNT} lit</span>
          </h3>
          <div className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-3">
            {lit.map((isLit, i) => (
              <button
                key={i}
                type="button"
                onClick={() => lightDiya(i)}
                aria-pressed={isLit}
                aria-label={isLit ? `Diya ${i + 1}, lit` : `Light diya ${i + 1}`}
                className="flex items-end justify-center rounded-2xl min-h-[64px] sm:min-h-[76px] bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c]"
              >
                <Diya size={52} lit={isLit} className={isLit && i === lastLit ? 'is-igniting' : ''} />
              </button>
            ))}
          </div>
          <p className="min-h-[1.5rem] mt-2 text-sm font-semibold text-[#ffd34d]" aria-live="polite">
            {lastLit >= 0 && <span key={lastLit} className="diwali-pop inline-block">{litCount === DIYA_COUNT ? 'All diyas are glowing — Happy Diwali! 🪔' : 'A little light makes everything brighter!'}</span>}
          </p>
          {litCount === DIYA_COUNT && (
            <button
              type="button"
              onClick={() => {
                setLit(Array(DIYA_COUNT).fill(false));
                setLastLit(-1);
              }}
              className="text-xs font-semibold text-[#f1d58a] underline underline-offset-2 min-h-[32px]"
            >
              Light them again
            </button>
          )}
        </section>

        {/* B. Rocket launcher (replaces the old "Launch Fireworks" button). */}
        <section aria-labelledby={`${titleId}-rocket`} className="px-5 pt-4 pb-5">
          <h3 id={`${titleId}-rocket`} className="text-sm font-bold uppercase tracking-wider text-[#f1d58a] mb-3">
            Light the Rocket
          </h3>
          <RocketLauncher />
        </section>
      </div>
    </div>,
    document.body
  );
}
