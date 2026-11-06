import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Volume2, VolumeX } from 'lucide-react';
import { Diya } from './DiwaliArt.jsx';
import { RocketLauncher } from './RocketLauncher.jsx';
import { createDiwaliAudio } from './diwaliAudio.js';
import { useMediaQuery, MOBILE_QUERY } from '../../context/MobileShellContext.jsx';

const DIYA_COUNT = 5; // small fixed limit: no unbounded DOM or animations

/**
 * "Light Up the Celebration!" — lazy-loaded festive overlay (DiwaliBanner).
 * Stage A: light all five diyas (unlock sound once). Stage B: the rocket game,
 * locked until then. Local state only; no API or storage. Audio: one manager
 * per opening (diwaliAudio.js), released on close; the rocket's animation runs
 * only during a launch and is cancelled on close (RocketLauncher).
 */
export default function DiwaliGame({ onClose }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const [lit, setLit] = useState(() => Array(DIYA_COUNT).fill(false));
  const [lastLit, setLastLit] = useState(-1);
  const litCount = lit.filter(Boolean).length;
  const unlocked = litCount === DIYA_COUNT;
  // Phones get a full-screen experience; larger screens keep the centred window.
  const fullScreen = useMediaQuery(MOBILE_QUERY);

  // One audio manager for this opening of the game; everything stops and is released on close.
  const audio = useMemo(() => createDiwaliAudio(), []);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  useEffect(() => () => audio.dispose(), [audio]);
  // Browsers allow sound only after a gesture: the first tap inside the game unlocks and preloads it.
  const onFirstGesture = useCallback(() => {
    audio.preload();
    audio.unlock();
  }, [audio]);
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return undefined;
    el.addEventListener('pointerdown', onFirstGesture, { capture: true, once: true });
    el.addEventListener('keydown', onFirstGesture, { capture: true, once: true });
    return () => {
      el.removeEventListener('pointerdown', onFirstGesture, { capture: true });
      el.removeEventListener('keydown', onFirstGesture, { capture: true });
    };
  }, [onFirstGesture, fullScreen]); // the dialog element changes between the phone and desktop layouts
  // Leaving the tab silences the game (no audio left playing in the background).
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && audio.stopAll();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [audio]);
  const toggleMute = () => {
    audio.setMuted(!muted);
    setMuted(!muted);
  };
  const changeVolume = (e) => {
    const v = Number(e.target.value);
    audio.setVolume(v);
    setVolume(v);
  };

  // No background scrolling while the game is open; restored exactly on close.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.overflow, body.style.overflow, body.style.overscrollBehavior];
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    return () => {
      [html.style.overflow, body.style.overflow, body.style.overscrollBehavior] = prev;
    };
  }, []);

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
      const items = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])')];
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
    const next = lit.map((v, j) => (j === i ? true : v));
    setLit(next);
    setLastLit(i);
    // The fifth diya: unlock sound exactly once (an event, never a re-render).
    if (next.every(Boolean)) audio.play('unlock');
  };
  // Play Again (from the rocket game): all five diyas go dark, the rocket locks again.
  const resetDiyas = useCallback(() => {
    setLit(Array(DIYA_COUNT).fill(false));
    setLastLit(-1);
  }, []);

  const diyas = (
    <section aria-label="Diyas" className={fullScreen ? 'px-4 pt-2 shrink-0' : 'px-5 pt-4'}>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {lit.map((isLit, i) => (
          <button
            key={i}
            type="button"
            onClick={() => lightDiya(i)}
            aria-pressed={isLit}
            aria-label={isLit ? `Diya ${i + 1}, lit` : `Light diya ${i + 1}`}
            className={`diwali-diya-slot flex items-end justify-center rounded-2xl ${fullScreen ? 'min-h-[56px]' : 'min-h-[64px] sm:min-h-[76px]'} border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c] ${isLit ? 'is-lit' : ''}`}
          >
            <Diya size={fullScreen ? 46 : 52} lit={isLit} className={isLit && i === lastLit ? 'is-igniting' : ''} />
          </button>
        ))}
      </div>
      <div className="min-h-[1.75rem] mt-1.5 flex items-center justify-between gap-2" aria-live="polite">
        <p className="text-xs sm:text-sm font-semibold text-[#ffd34d]">
          {lastLit >= 0 && <span key={lastLit} className="diwali-pop inline-block">{litCount === DIYA_COUNT ? 'All diyas are glowing — Happy Diwali! 🪔' : 'A little light makes everything brighter!'}</span>}
        </p>
        <span className={`diwali-progress shrink-0 ${unlocked ? 'is-complete' : ''}`} aria-label={`${litCount} of ${DIYA_COUNT} diyas lit`}>
          <span className="flex gap-1" aria-hidden="true">
            {lit.map((v, i) => (
              <span key={i} className={`diwali-progress-dot ${v ? 'is-on' : ''}`} />
            ))}
          </span>
          {litCount}/{DIYA_COUNT}
        </span>
      </div>
    </section>
  );

  // Minimal top bar: small branding + close. No instructions anywhere.
  const topBar = (
    <div className={`flex items-center justify-between gap-3 shrink-0 ${fullScreen ? 'px-4 pt-2' : 'px-5 pt-4'}`}>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#c9972f]">ZORX INDIA · Diwali 2026</p>
        <h2 id={titleId} className="text-base sm:text-lg font-bold text-[#f7d58c] leading-tight">
          Light Up the Celebration
        </h2>
      </div>
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {!fullScreen && (
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={changeVolume}
            disabled={muted}
            aria-label="Volume"
            className="diwali-volume w-24 accent-[#f5c542] disabled:opacity-40"
          />
        )}
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          className="w-11 h-11 inline-flex items-center justify-center rounded-full border border-[#c9972f]/45 bg-black/20 text-[#f7d58c] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c]"
        >
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </button>
      </div>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full border border-[#c9972f]/45 bg-black/20 text-[#f7d58c] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c]"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );

  if (fullScreen) {
    return createPortal(
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="diwali-fullscreen fixed inset-0 z-[60] flex flex-col overflow-hidden overscroll-none text-[#fbeed0]"
      >
        {topBar}
        {diyas}
        <section aria-label="Rocket" className="relative flex-1 min-h-0 flex flex-col">
          <RocketLauncher fill locked={!unlocked} audio={audio} onPlayAgain={resetDiyas} />
        </section>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-[#050b14]/75 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="diwali-window relative w-full max-w-xl max-h-full overflow-y-auto rounded-3xl border border-[#c9972f]/40 text-[#fbeed0] shadow-2xl"
      >
        {topBar}
        {diyas}
        <section aria-label="Rocket" className="px-5 pt-1 pb-5">
          <RocketLauncher locked={!unlocked} audio={audio} onPlayAgain={resetDiyas} />
        </section>
      </div>
    </div>,
    document.body
  );
}
