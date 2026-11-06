import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Diya } from './DiwaliArt.jsx';
import { createBurst, step } from './fireworks.js';
import { PHASE, LAYOUT, HINTS, transition, toPx, canDrag, isLit } from './rocketGame.js';

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
          <stop offset="0" stopColor="#5e0f16" />
          <stop offset="0.45" stopColor="#b3202c" />
          <stop offset="0.7" stopColor="#d23a3f" />
          <stop offset="1" stopColor="#6d121b" />
        </linearGradient>
        <linearGradient id="rk-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#8a6418" />
          <stop offset="0.5" stopColor="#f7d58c" />
          <stop offset="1" stopColor="#8a6418" />
        </linearGradient>
        <linearGradient id="rk-stick" x1="0" x2="1">
          <stop offset="0" stopColor="#7a5a2e" />
          <stop offset="1" stopColor="#c9a46a" />
        </linearGradient>
      </defs>
      {/* Bamboo guide stick */}
      <rect x="25.5" y="34" width="3" height="58" rx="1.5" fill="url(#rk-stick)" />
      {/* Nose cone */}
      <path d="M18 2 L27 18 L9 18 Z" fill="url(#rk-gold)" />
      {/* Body with gold bands */}
      <rect x="9" y="17" width="18" height="40" rx="2" fill="url(#rk-body)" />
      <rect x="9" y="22" width="18" height="3" fill="url(#rk-gold)" />
      <rect x="9" y="48" width="18" height="3" fill="url(#rk-gold)" />
      <path d="M12 30 L24 30 M12 35 L24 35 M12 40 L24 40" stroke="#f7d58c" strokeOpacity="0.35" strokeWidth="0.8" />
      <rect x="9" y="56" width="18" height="2" fill="#3b0a0f" />
      {/* Fuse */}
      <path d="M18 58 C17 60 19 62 18 64" stroke={lit ? '#ffb347' : '#8c7a5b'} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {lit && (
        <g className="rocket-fuse-fire">
          <circle cx={FUSE.x} cy={FUSE.y} r="6" fill="#ffb02e" opacity="0.35" />
          <path d="M18 59 C21 62 21 65 18 67 C15 65 15 62 18 59 Z" fill="#ffd34d" />
          <circle cx={FUSE.x} cy={FUSE.y} r="1.6" fill="#fff6cf" />
        </g>
      )}
    </svg>
  );
}

/**
 * The Diwali rocket game: carry the rocket to the flame, light the fuse, put it
 * back on its launch spot, watch it fly and burst. Rules live in rocketGame.js.
 */
export function RocketLauncher() {
  const stageRef = useRef(null);
  const rocketRef = useRef(null);
  const canvasRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 }); // fuse tip, stage px
  const drag = useRef(null); // { id, dx, dy } while held
  const timers = useRef({ frame: 0, prep: 0, snap: 0 });
  const [phase, setPhaseState] = useState(PHASE.READY);
  const phaseRef = useRef(PHASE.READY);
  const [dragging, setDragging] = useState(false);

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
      clearTimeout(t.prep);
      clearTimeout(t.snap);
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
    const burstAt = (at) => {
      const ring = createBurst(at.x, at.y, Math.random, 40).map((p) => ({ ...p, vx: p.vx * 1.75, vy: p.vy * 1.75, size: p.size + 0.6 }));
      const inner = createBurst(at.x, at.y, Math.random, 28).map((p) => ({ ...p, vx: p.vx * 1.05, vy: p.vy * 1.05, color: '#fff1b8' }));
      const crackle = createBurst(at.x, at.y, Math.random, 16).map((p) => ({ ...p, vx: p.vx * 0.6, vy: p.vy * 0.6, size: 1.8, color: '#ffe08a', delay: 0.4 }));
      return [...ring, ...inner, ...crackle];
    };

    if (reducedMotion()) {
      // No motion: the rocket is simply gone and one still frame of the burst is shown.
      const at = { x: s.w * 0.42, y: top };
      rocket.style.opacity = '0';
      let ps = burstAt(at).map((p) => ({ ...p, delay: 0 }));
      ps = step(ps, 0.4);
      draw(ps);
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
  }, [place, setPhase]);

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
      if (next === PHASE.LAUNCHING) beginLaunch();
      if (before === PHASE.LIGHTING && next === PHASE.READY) place(padPx(), { animate: true }); // unlit: springs back
      return next;
    },
    [beginLaunch, place, setPhase]
  );

  const pointer = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e) => {
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
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setDragging(false);
    apply({ type: 'drop' });
  };

  // Keyboard: Enter/Space carries the rocket to the flame, then back to the pad.
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
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

  const playAgain = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    if (rocketRef.current) rocketRef.current.style.opacity = '';
    setPhase(transition(phaseRef.current, { type: 'reset' }));
    place(padPx());
  };

  const lit = isLit(phase);
  const label = {
    READY: 'Rocket, unlit. Drag it to the flame, or press Enter to light it.',
    LIGHTING: 'Rocket, unlit, being carried to the flame.',
    LIT: 'Rocket, fuse lit. Drag it back to the launch spot, or press Enter to launch.',
    RETURNING: 'Rocket, fuse lit, being carried to the launch spot.',
    LAUNCHING: 'Rocket launching.',
    EXPLODING: 'Rocket exploded.',
    COMPLETED: 'Rocket launched.',
  }[phase];

  return (
    <div>
      <div
        ref={stageRef}
        className="rocket-stage relative h-64 sm:h-72 rounded-2xl overflow-hidden border border-white/10 select-none"
        data-phase={phase}
      >
        {/* Launch spot (glows once the fuse is lit). */}
        <span
          aria-hidden="true"
          className={`rocket-pad absolute -translate-x-1/2 -translate-y-1/2 ${lit && phase !== PHASE.LAUNCHING ? 'is-ready' : ''}`}
          style={{ left: `${LAYOUT.pad.x * 100}%`, top: `${LAYOUT.pad.y * 100}%` }}
        />
        <span className="absolute -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-[#f1d58a]/60" style={{ left: `${LAYOUT.pad.x * 100}%`, top: `calc(${LAYOUT.pad.y * 100}% + 26px)` }} aria-hidden="true">
          Launch
        </span>
        {/* Fixed flame station: a brass stand with a lit diya (its flame is the target). */}
        <div className="absolute pointer-events-none" style={{ left: `calc(${LAYOUT.flame.x * 100}% - 32px)`, top: `calc(${LAYOUT.flame.y * 100}% - 25px)` }} aria-hidden="true">
          <span className="rocket-flame-halo absolute left-1/2 top-[25px] -translate-x-1/2 -translate-y-1/2" />
          <Diya size={64} />
          <svg viewBox="0 0 64 40" width="64" height="40" className="-mt-2 block">
            <path d="M24 0 L40 0 L36 10 L28 10 Z" fill="#b8892f" />
            <rect x="30" y="10" width="4" height="22" fill="#8a6418" />
            <ellipse cx="32" cy="34" rx="16" ry="4" fill="#b8892f" />
          </svg>
        </div>

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />

        <button
          ref={rocketRef}
          type="button"
          aria-label={label}
          aria-disabled={!canDrag(phase) || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={`rocket absolute left-0 top-0 touch-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c] ${
            canDrag(phase) ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          } ${dragging ? 'is-dragging' : ''}`}
          style={{ width: RW, height: RH }}
        >
          <Rocket lit={lit} />
        </button>

        {(phase === PHASE.EXPLODING || phase === PHASE.COMPLETED) && (
          <p className="diwali-pop absolute inset-x-0 top-[50%] text-center text-xl sm:text-2xl font-extrabold text-[#f7d58c] drop-shadow" role="status">
            ✨ Happy Diwali! ✨
          </p>
        )}
      </div>

      <div className="mt-3 min-h-[48px] flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#ffd34d]" aria-live="polite">
          {HINTS[phase]}
        </p>
        {phase === PHASE.COMPLETED && (
          <button
            type="button"
            onClick={playAgain}
            className="shrink-0 min-h-[44px] px-4 rounded-xl font-bold bg-[#f5c542] text-[#173d29] hover:bg-[#f7d58c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#173d29]"
          >
            Play Again
          </button>
        )}
      </div>
    </div>
  );
}
