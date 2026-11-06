import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Diya } from './DiwaliArt.jsx';
import { createShow, step } from './fireworks.js';

const DIYA_COUNT = 5; // small fixed limit: no unbounded DOM or animations
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * "Light Up the Celebration!" — lazy-loaded festive overlay (DiwaliBanner).
 * Local state only; no API, storage or audio. The canvas loop runs only while
 * a fireworks show is playing and is cancelled on close.
 */
export default function DiwaliGame({ onClose }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const [lit, setLit] = useState(() => Array(DIYA_COUNT).fill(false));
  const [lastLit, setLastLit] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
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
      cancelAnimationFrame(frameRef.current);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [onClose]);

  const lightDiya = (i) => {
    if (lit[i]) return;
    setLit((prev) => prev.map((v, j) => (j === i ? true : v)));
    setLastLit(i);
  };

  const launch = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || playing) return; // never overlap shows
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setShowGreeting(false);

    let particles = createShow(w, h);
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (p.delay > 0) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.ttl);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    if (prefersReducedMotion()) {
      // No motion: one still frame of the burst, then the greeting.
      for (const p of particles) p.delay = 0;
      particles = step(particles, 0.45);
      draw();
      setShowGreeting(true);
      return;
    }

    setPlaying(true);
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      particles = step(particles, dt);
      draw();
      if (particles.length) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = 0;
        ctx.clearRect(0, 0, w, h);
        setPlaying(false);
        setShowGreeting(true);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [playing]);

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

        {/* B. Launch Fireworks */}
        <section aria-labelledby={`${titleId}-fw`} className="px-5 pt-4 pb-5">
          <h3 id={`${titleId}-fw`} className="sr-only">
            Fireworks
          </h3>
          <div className="relative h-48 sm:h-56 rounded-2xl overflow-hidden bg-[#0a1a11] border border-white/10">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
            {showGreeting && (
              <p className="diwali-pop absolute inset-x-0 bottom-4 text-center text-lg font-extrabold text-[#f7d58c] px-4" role="status">
                Happy Diwali from ZORX INDIA! ✨
              </p>
            )}
            {!showGreeting && !playing && <p className="absolute inset-0 flex items-center justify-center text-sm text-[#e0efdf]/60">The sky is waiting…</p>}
          </div>
          <button
            type="button"
            onClick={launch}
            disabled={playing}
            className="mt-3 w-full min-h-[48px] rounded-xl font-bold bg-[#f5c542] text-[#173d29] hover:bg-[#f7d58c] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#173d29]"
          >
            <span aria-hidden="true">🎆 </span>
            {playing ? 'Fireworks in the sky…' : 'Launch Fireworks'}
          </button>
        </section>
      </div>
    </div>,
    document.body
  );
}
