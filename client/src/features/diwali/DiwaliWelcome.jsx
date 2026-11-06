import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createShow, step, WELCOME_SHOW } from './fireworks.js';

const GREETING_MS = 3800;

/**
 * Automatic Diwali welcome (lazy-loaded by DiwaliWelcomeGate): ~3.5 s of
 * fireworks over the top of the screen plus a greeting, then everything is
 * removed. pointer-events: none throughout, so the page stays fully usable.
 */
export default function DiwaliWelcome({ onDone }) {
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    let frame = 0;
    let hideTimer = 0;
    let doneTimer = 0;
    if (ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let particles = createShow(w, h, Math.random, WELCOME_SHOW);
      let last = performance.now();
      const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        particles = step(particles, dt);
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
        frame = particles.length ? requestAnimationFrame(tick) : 0; // stops by itself when the show ends
      };
      frame = requestAnimationFrame(tick);
    }
    hideTimer = setTimeout(() => setVisible(false), GREETING_MS);
    doneTimer = setTimeout(onDone, GREETING_MS + 450);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[55] h-[55vh]" aria-hidden={!visible}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      <div
        role="status"
        className={`absolute inset-x-0 mx-auto top-[env(safe-area-inset-top)] mt-20 w-[min(92vw,30rem)] rounded-2xl border border-[#c9972f]/60 bg-[#0d2417]/90 px-5 py-3 text-center shadow-2xl backdrop-blur-sm transition-opacity duration-500 ${
          visible ? 'opacity-100 diwali-pop' : 'opacity-0'
        }`}
      >
        <p className="text-lg sm:text-xl font-extrabold text-[#f7d58c]">✨ Happy Diwali Makkale! ✨</p>
        <p className="text-xs sm:text-sm text-[#e0efdf] mt-0.5">Wishing you happiness, prosperity and success.</p>
      </div>
    </div>,
    document.body
  );
}
