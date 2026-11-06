import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createBurst, step } from './fireworks.js';
import { Lock } from 'lucide-react';
import { PHASE, LAYOUT, transition, toPx, canDrag, isLit } from './rocketGame.js';

// Rocket artwork box; FUSE = the fuse tip inside it (the point that must touch
// the flame, and that sits on the launch spot).
const RW = 36;
const RH = 92;
const FUSE = { x: 18, y: 64 };
const FLIGHT_MS = 950;
const PREP_MS = 480;
const MAX_TRAIL = 70;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Rocket({ lit }) {
  return (
    <svg viewBox={`0 0 ${RW} ${RH}`} width={RW} height={RH} aria-hidden="true" focusable="false" className="block overflow-visible">
      <defs>
        <linearGradient id="rk-body" x1="0" x2="1">
          <stop offset="0" stopColor="#4a0a12" />
          <stop offset="0.3" stopColor="#9b1b27" />
          <stop offset="0.55" stopColor="#d9434a" />
          <stop offset="0.62" stopColor="#f07a73" />
          <stop offset="0.75" stopColor="#b3202c" />
          <stop offset="1" stopColor="#520b14" />
        </linearGradient>
        <linearGradient id="rk-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#7a5514" />
          <stop offset="0.45" stopColor="#f3d28a" />
          <stop offset="0.6" stopColor="#fff1c4" />
          <stop offset="1" stopColor="#7a5514" />
        </linearGradient>
        <linearGradient id="rk-stick" x1="0" x2="1">
          <stop offset="0" stopColor="#6b4b22" />
          <stop offset="0.5" stopColor="#d2b07a" />
          <stop offset="1" stopColor="#7a5a2e" />
        </linearGradient>
        <radialGradient id="rk-spark" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset="0.4" stopColor="#ffc94d" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff8a1f" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Bamboo guide stick with nodes */}
      <rect x="25.5" y="34" width="3" height="58" rx="1.5" fill="url(#rk-stick)" />
      <path d="M25.5 52h3M25.5 70h3M25.5 86h3" stroke="#5a3d1a" strokeWidth="0.8" />
      {/* Nose cone with a highlight */}
      <path d="M18 1.5 C22 7 25.5 12 27 18 L9 18 C10.5 12 14 7 18 1.5 Z" fill="url(#rk-gold)" />
      <path d="M18 3 C16 7 14.5 11 13.6 16" stroke="#fff6cf" strokeOpacity="0.6" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      {/* Body: paper tube with gold bands and a diamond motif */}
      <rect x="9" y="17.5" width="18" height="39.5" rx="1.5" fill="url(#rk-body)" />
      <rect x="9" y="21" width="18" height="2.6" fill="url(#rk-gold)" />
      <rect x="9" y="49.5" width="18" height="2.6" fill="url(#rk-gold)" />
      <path d="M18 28 L22.5 36.5 L18 45 L13.5 36.5 Z" fill="none" stroke="#f3d28a" strokeOpacity="0.75" strokeWidth="1" />
      <circle cx="18" cy="36.5" r="1.4" fill="#f3d28a" fillOpacity="0.85" />
      <rect x="9" y="56" width="18" height="2.2" rx="1" fill="#2c070c" />
      {/* Fuse (twisted paper) */}
      <path d="M18 58 C16.6 59.6 19.4 61.6 18 63.6" stroke={lit ? '#ffb347' : '#a08d68'} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {lit && (
        <g className="rocket-fuse-fire">
          <circle cx={FUSE.x} cy={FUSE.y} r="8" fill="url(#rk-spark)" />
          <path d="M18 58.5 C21.2 61.5 21.2 65 18 67.5 C14.8 65 14.8 61.5 18 58.5 Z" fill="#ffd34d" />
          <path d="M18 61 C19.4 62.6 19.4 64.6 18 66 C16.6 64.6 16.6 62.6 18 61 Z" fill="#fff6cf" />
          <g className="rocket-fuse-sparks" stroke="#ffe08a" strokeWidth="0.9" strokeLinecap="round">
            <path d="M18 64 l-6 -4" />
            <path d="M18 64 l6 -5" />
            <path d="M18 64 l-5 5" />
            <path d="M18 64 l5 4" />
          </g>
        </g>
      )}
    </svg>
  );
}

/** The fixed fire: a brass deepa stand with a layered, flickering flame. Its flame centre is the target. */
function FlameStation() {
  return (
    <svg viewBox="0 0 80 120" width="80" height="120" aria-hidden="true" focusable="false" className="block overflow-visible">
      <defs>
        <radialGradient id="fs-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffcf5c" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ff9a2e" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ff9a2e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fs-outer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a3" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#ff9a2e" />
          <stop offset="1" stopColor="#d9480f" />
        </linearGradient>
        <linearGradient id="fs-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="1" stopColor="#ffc233" />
        </linearGradient>
        <linearGradient id="fs-brass" x1="0" x2="1">
          <stop offset="0" stopColor="#6e4f17" />
          <stop offset="0.45" stopColor="#e0b75a" />
          <stop offset="0.6" stopColor="#fbe3a0" />
          <stop offset="1" stopColor="#6e4f17" />
        </linearGradient>
      </defs>
      <circle className="flame-station-glow" cx="40" cy="30" r="38" fill="url(#fs-glow)" />
      <g className="flame-station-outer">
        <path d="M40 2 C49 14 54 22 54 31 C54 40 47.5 45 40 45 C32.5 45 26 40 26 31 C26 22 31 14 40 2 Z" fill="url(#fs-outer)" />
      </g>
      <g className="flame-station-inner">
        <path d="M40 14 C45.5 21 47.5 26 47.5 32 C47.5 38 44 42 40 42 C36 42 32.5 38 32.5 32 C32.5 26 34.5 21 40 14 Z" fill="url(#fs-mid)" />
        <ellipse cx="40" cy="37" rx="3.2" ry="4" fill="#fffbea" />
      </g>
      {/* Bowl, stem and base */}
      <path d="M22 44 C24 54 32 58 40 58 C48 58 56 54 58 44 Z" fill="url(#fs-brass)" />
      <path d="M22 44 C30 47 50 47 58 44" stroke="#fff1c4" strokeOpacity="0.55" strokeWidth="1" fill="none" />
      <rect x="37" y="58" width="6" height="40" fill="url(#fs-brass)" />
      <ellipse cx="40" cy="72" rx="7" ry="2.2" fill="url(#fs-brass)" />
      <path d="M26 112 C28 102 34 98 40 98 C46 98 52 102 54 112 Z" fill="url(#fs-brass)" />
      <ellipse cx="40" cy="113" rx="18" ry="3.5" fill="#3a2a0d" opacity="0.55" />
    </svg>
  );
}

/**
 * The Diwali rocket game: carry the rocket to the flame, light the fuse, put it
 * back on its launch spot, watch it fly and burst. Rules live in rocketGame.js.
 */
/**
 * `locked`: until all five diyas glow the rocket and flame only answer with a laugh.
 * `audio`: the game's audio manager (diwaliAudio.js) — cues are fired from real events
 * only (never from re-renders or pointer movement). `onPlayAgain`: the parent resets the diyas.
 */
export function RocketLauncher({ fill = false, locked = false, audio = null, onPlayAgain } = {}) {
  const stageRef = useRef(null);
  const rocketRef = useRef(null);
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 }); // fuse tip, stage px
  const drag = useRef(null); // { id, dx, dy } while held
  const timers = useRef({ frame: 0, prep: 0, snap: 0 });
  const [phase, setPhaseState] = useState(PHASE.READY);
  const phaseRef = useRef(PHASE.READY);
  const [dragging, setDragging] = useState(false);
  const flameRef = useRef(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const cue = useCallback((name) => audio?.play(name), [audio]);
  // Short CSS feedback on an element (no React state, so no re-render storm).
  const flash = (el, cls, ms = 450) => {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    clearTimeout(timers.current[cls]);
    timers.current[cls] = setTimeout(() => el.classList.remove(cls), ms);
  };
  const refuse = (el) => {
    cue('chiri');
    flash(el, 'is-refused');
  };
  // Unlock moment: a short celebratory note when the five diyas complete.
  const [unlockNote, setUnlockNote] = useState(false);
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (wasLocked.current && !locked) {
      setUnlockNote(true);
      timers.current.unlockNote = setTimeout(() => setUnlockNote(false), 2600);
    }
    if (locked) setUnlockNote(false);
    wasLocked.current = locked;
  }, [locked]);

  const setPhase = useCallback((next) => {
    if (next === phaseRef.current) return;
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const stage = () => {
    const el = stageRef.current;
    return { w: el?.clientWidth || 0, h: el?.clientHeight || 0 };
  };
  const place = useCallback((p, { animate = false } = {}) => {
    pos.current = p;
    const el = rocketRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 380ms cubic-bezier(.2,.8,.2,1)' : 'none';
    el.style.transform = `translate(${p.x - FUSE.x}px, ${p.y - FUSE.y}px)`;
  }, []);
  const padPx = () => {
    const s = stage();
    return toPx(LAYOUT.pad, s.w, s.h);
  };

  // Initial placement, and re-placement when the stage is resized (while not in flight).
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const settle = () => {
      if (drag.current) return;
      const ph = phaseRef.current;
      if (ph === PHASE.READY || ph === PHASE.COMPLETED) place(padPx());
      else if (ph === PHASE.LIT) {
        const s = stage();
        place({ x: Math.min(Math.max(pos.current.x, 20), s.w - 20), y: Math.min(Math.max(pos.current.y, 30), s.h - 30) });
      }
    };
    settle();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(settle) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [place]);

  // Everything stops on unmount (closing the dialog).
  useEffect(() => {
    const t = timers.current;
    return () => {
      cancelAnimationFrame(t.frame);
      for (const id of Object.values(t)) clearTimeout(id);
    };
  }, []);

  const launch = useCallback(() => {
    const s = stage();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const rocket = rocketRef.current;
    if (!ctx || !rocket) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(s.w * dpr);
    canvas.height = Math.round(s.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const start = { ...pos.current };
    const top = s.h * LAYOUT.burstY;
    const draw = (particles, flash = 0, at = null) => {
      ctx.clearRect(0, 0, s.w, s.h);
      ctx.globalCompositeOperation = 'lighter';
      if (flash > 0 && at) {
        const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, 90);
        g.addColorStop(0, `rgba(255, 230, 160, ${0.55 * flash})`);
        g.addColorStop(1, 'rgba(255, 200, 80, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(at.x - 90, at.y - 90, 180, 180);
      }
      for (const p of particles) {
        if (p.delay > 0) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.ttl);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
    // Layered burst: gold outer ring, a delayed festive ring, a warm-white core and late crackle.
    // Varied sizes and lifetimes so it opens and fades naturally (~110 particles).
    const burstAt = (at) => {
      const vary = (ps, speed, extra) => ps.map((p) => ({ ...p, vx: p.vx * speed, vy: p.vy * speed, size: 1.3 + Math.random() * 2.2, ...extra(p) }));
      const ring = vary(createBurst(at.x, at.y, Math.random, 40), 1.8, () => ({}));
      const festive = vary(createBurst(at.x, at.y, Math.random, 30), 1.3, (p) => ({ color: ['#ff6b4a', '#ff9a3c', '#ff7aa8'][Math.floor(Math.random() * 3)], delay: 0.12, life: p.life * 0.9, ttl: p.ttl * 0.9 }));
      const core = vary(createBurst(at.x, at.y, Math.random, 24), 0.75, () => ({ color: '#fff1b8' }));
      const crackle = vary(createBurst(at.x, at.y, Math.random, 16), 0.5, () => ({ size: 1.4, color: '#ffe08a', delay: 0.45 }));
      return [...ring, ...festive, ...core, ...crackle];
    };

    if (reducedMotion()) {
      // No motion: the rocket is simply gone and one still frame of the burst is shown.
      const at = { x: s.w * 0.42, y: top };
      rocket.style.opacity = '0';
      let ps = burstAt(at).map((p) => ({ ...p, delay: 0 }));
      ps = step(ps, 0.4);
      draw(ps);
      cue('full'); // the celebration
      setPhase(transition(PHASE.LAUNCHING, { type: 'launched' }));
      setPhase(transition(PHASE.EXPLODING, { type: 'exploded' }));
      return;
    }

    let trail = [];
    let burst = null;
    let flashUntil = 0;
    let at = null;
    const t0 = performance.now();
    let last = t0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!burst) {
        const k = Math.min(1, (now - t0) / FLIGHT_MS);
        const e = k * k * (1.6 - 0.6 * k); // accelerates like a real rocket
        const x = start.x + (s.w * 0.42 - start.x) * e + Math.sin(k * 9) * 3 * (1 - k); // drifts toward the centre as it climbs
        const y = start.y + (top - start.y) * e;
        place({ x, y });
        rocket.style.transform += ` rotate(${Math.sin(k * 12) * 2}deg)`;
        if (trail.length < MAX_TRAIL) {
          for (let i = 0; i < 2; i++) {
            trail.push({ x: x + (Math.random() - 0.5) * 3, y: y + 2, vx: (Math.random() - 0.5) * 18, vy: 30 + Math.random() * 40, life: 0.45, ttl: 0.45, size: 1.8, color: i ? '#ffb02e' : '#ffe08a', delay: 0 });
          }
        }
        if (k >= 1) {
          at = { x, y };
          rocket.style.opacity = '0';
          burst = burstAt(at);
          flashUntil = now + 180;
          cue('full'); // the burst: the celebration track starts here, before completion
          setPhase(transition(phaseRef.current, { type: 'launched' }));
        }
      }
      trail = step(trail, dt);
      if (burst) burst = step(burst, dt);
      const all = burst ? [...trail, ...burst] : trail;
      draw(all, Math.max(0, (flashUntil - now) / 180), at);
      if (!burst || all.length) {
        timers.current.frame = requestAnimationFrame(tick);
      } else {
        timers.current.frame = 0;
        ctx.clearRect(0, 0, s.w, s.h);
        setPhase(transition(phaseRef.current, { type: 'exploded' }));
      }
    };
    timers.current.frame = requestAnimationFrame(tick);
  }, [place, setPhase, cue]);

  const beginLaunch = useCallback(() => {
    // Snap onto the pad, a short "fuse burning down" shake, then lift-off.
    place(padPx(), { animate: true });
    rocketRef.current?.classList.add('is-prepping');
    timers.current.prep = setTimeout(() => {
      rocketRef.current?.classList.remove('is-prepping');
      launch();
    }, PREP_MS);
  }, [launch, place]);

  const apply = useCallback(
    (event) => {
      const before = phaseRef.current;
      const next = transition(before, { stage: stage(), pos: pos.current, ...event });
      if (next === before) return next;
      setPhase(next);
      if (next === PHASE.LAUNCHING) {
        cue('velmuruka'); // exactly once: LAUNCHING is entered once per round
        beginLaunch();
      }
      if (before === PHASE.LIGHTING && next === PHASE.READY) {
        place(padPx(), { animate: true }); // unlit: springs back
        flash(rocketRef.current, 'is-miss');
      }
      if (before === PHASE.RETURNING && next === PHASE.LIT) flash(rocketRef.current, 'is-miss'); // lit, but not on the spot
      return next;
    },
    [beginLaunch, place, setPhase, cue]
  );

  const pointer = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e) => {
    e.stopPropagation();
    if (lockedRef.current) {
      e.preventDefault();
      refuse(rocketRef.current);
      return;
    }
    if (!canDrag(phaseRef.current) || drag.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = pointer(e);
    drag.current = { id: e.pointerId, dx: p.x - pos.current.x, dy: p.y - pos.current.y };
    setDragging(true);
    apply({ type: 'grab' });
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const p = pointer(e);
    const s = stage();
    place({ x: Math.min(Math.max(p.x - d.dx, 14), s.w - 14), y: Math.min(Math.max(p.y - d.dy, FUSE.y), s.h - (RH - FUSE.y) + 6) });
    apply({ type: 'move' });
    // Display only: the platform warms up as a lit rocket comes near it.
    const pad = toPx(LAYOUT.pad, s.w, s.h);
    padRef.current?.classList.toggle('is-near', isLit(phaseRef.current) && Math.hypot(pos.current.x - pad.x, pos.current.y - pad.y) < 110);
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setDragging(false);
    padRef.current?.classList.remove('is-near');
    apply({ type: 'drop' });
  };

  // Keyboard: Enter/Space carries the rocket to the flame, then back to the pad.
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (lockedRef.current) return refuse(rocketRef.current);
    const s = stage();
    const ph = phaseRef.current;
    if (ph === PHASE.READY) {
      apply({ type: 'grab' });
      place(toPx(LAYOUT.flame, s.w, s.h), { animate: true });
      timers.current.snap = setTimeout(() => apply({ type: 'drop' }), 400);
    } else if (ph === PHASE.LIT) {
      apply({ type: 'grab' });
      place(toPx(LAYOUT.pad, s.w, s.h));
      apply({ type: 'drop' });
    }
  };

  // The flame on its own: locked, or touched without bringing the rocket → laugh + flare.
  const onFlameDown = (e) => {
    e.stopPropagation();
    const ph = phaseRef.current;
    if (lockedRef.current || ph === PHASE.READY || ph === PHASE.LIT) refuse(flameRef.current);
  };
  // Anywhere else in the locked sky → the same laugh (cooldown in the audio manager).
  const onStageDown = () => {
    if (lockedRef.current) refuse(rocketRef.current);
  };

  const playAgain = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    if (rocketRef.current) rocketRef.current.style.opacity = '';
    setPhase(transition(phaseRef.current, { type: 'reset' }));
    place(padPx());
    audio?.stopAll(); // reset audio states for the new round
    onPlayAgain?.(); // the parent relights nothing: all five diyas go dark, the game locks again
  };

  const lit = isLit(phase);
  const label = {
    READY: 'Rocket',
    LIGHTING: 'Rocket',
    LIT: 'Rocket, fuse burning',
    RETURNING: 'Rocket, fuse burning',
    LAUNCHING: 'Rocket, in flight',
    EXPLODING: 'Rocket, burst',
    COMPLETED: 'Rocket, burst',
  }[phase];

  return (
    <div className={fill ? 'flex-1 min-h-0 flex flex-col' : ''}>
      <div
        ref={stageRef}
        className={`rocket-stage relative overflow-hidden select-none ${locked ? 'is-locked' : 'is-unlocked'} ${fill ? 'flex-1 min-h-[320px]' : 'h-80 rounded-2xl border border-white/10'}`}
        data-phase={phase}
        data-locked={locked || undefined}
        onPointerDown={onStageDown}
      >
        <span className="rocket-horizon" aria-hidden="true" />
        {/* Launch platform: a small stone slab (warms when the fuse is lit, brighter as the rocket nears). */}
        <span
          ref={padRef}
          aria-hidden="true"
          className={`rocket-pad absolute -translate-x-1/2 -translate-y-1/2 ${lit && phase !== PHASE.LAUNCHING ? 'is-ready' : ''}`}
          style={{ left: `${LAYOUT.pad.x * 100}%`, top: `${LAYOUT.pad.y * 100}%` }}
        />
        {/* Fixed flame station: flame centre (SVG 40,30) sits exactly on LAYOUT.flame. */}
        <div ref={flameRef} className="rocket-flame-station absolute pointer-events-none" style={{ left: `calc(${LAYOUT.flame.x * 100}% - 40px)`, top: `calc(${LAYOUT.flame.y * 100}% - 30px)` }} aria-hidden="true">
          <FlameStation />
        </div>
        {/* Tap target for the flame itself (the rocket sits above it while being lit). */}
        <button
          type="button"
          aria-label="Flame"
          onPointerDown={onFlameDown}
          className="rocket-flame-hit absolute -translate-x-1/2 -translate-y-1/2 rounded-full touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c]"
          style={{ left: `${LAYOUT.flame.x * 100}%`, top: `calc(${LAYOUT.flame.y * 100}% + 10px)`, width: 72, height: 96 }}
        />

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />

        <button
          ref={rocketRef}
          type="button"
          aria-label={locked ? 'Rocket, locked' : label}
          aria-disabled={locked || !canDrag(phase) || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={`rocket absolute left-0 top-0 touch-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c] ${
            !locked && canDrag(phase) ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-not-allowed'
          } ${dragging ? 'is-dragging' : ''}`}
          style={{ width: RW, height: RH }}
        >
          <Rocket lit={lit} />
        </button>

        {/* Locked: a quiet lock mark, no instructions. */}
        <span className={`rocket-lock-badge pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 ${locked ? 'is-shown' : ''}`} aria-hidden="true">
          <Lock size={14} />
        </span>
        {unlockNote && (
          <p className="rocket-unlock-note diwali-pop pointer-events-none absolute inset-x-0 top-[18%] text-center px-4" role="status">
            ✨ All five diyas glow ✨
          </p>
        )}
        {(phase === PHASE.EXPLODING || phase === PHASE.COMPLETED) && (
          <p className="rocket-greeting diwali-pop absolute inset-x-0 top-[46%] text-center px-4" role="status">
            ✨ Happy Diwali! ✨
          </p>
        )}
        {phase === PHASE.COMPLETED && (
          <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center diwali-pop">
            <button
              type="button"
              onClick={playAgain}
              className="min-h-[48px] px-6 rounded-full font-semibold tracking-wide bg-[#f5c542]/95 text-[#14281c] shadow-lg hover:bg-[#f7d58c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1a26]"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
