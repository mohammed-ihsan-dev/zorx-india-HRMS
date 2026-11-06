import { lazy, Suspense, useState } from 'react';
import { Diya } from './DiwaliArt.jsx';

// The mini-game is downloaded only when someone opens it.
const DiwaliGame = lazy(() => import('./DiwaliGame.jsx'));

/**
 * Compact festive greeting with the "Celebrate Diwali" entry button.
 * `tone="dark"` for the phone shell. Render only while useDiwaliActive() is true.
 */
export function DiwaliBanner({ tone = 'light' }) {
  const [open, setOpen] = useState(false);
  const dark = tone === 'dark';
  return (
    <>
      <section
        aria-label="Diwali greeting"
        className={`relative overflow-hidden rounded-2xl border flex items-center ${dark ? 'gap-2 px-2.5 py-2' : 'gap-3 px-4 sm:px-5 py-3'} ${
          dark ? 'bg-gradient-to-r from-[#0d2417] to-[#173d29] border-[#c9972f]/40' : 'bg-gradient-to-r from-[#173d29] via-[#1f5138] to-[#2f5f28] border-[#c9972f]/50 shadow-sm'
        }`}
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-10 w-32 h-32 rounded-full bg-[#f5c542]/10" />
        <Diya size={dark ? 30 : 42} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`font-extrabold text-[#f7d58c] leading-tight ${dark ? 'text-[13px]' : 'text-base sm:text-lg'}`}>Wishing You a Bright &amp; Beautiful Diwali!</p>
          <p className={`text-[#e0efdf] leading-snug ${dark ? 'text-[11px] line-clamp-1' : 'text-xs sm:text-sm mt-0.5'}`}>
            May this festival bring happiness, prosperity, positivity and success to you and your family.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`shrink-0 rounded-xl font-bold bg-[#f5c542] text-[#173d29] hover:bg-[#f7d58c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7d58c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#173d29] transition-colors ${
            dark ? 'min-h-[44px] px-2.5 text-[11px] leading-tight max-w-[96px]' : 'min-h-[44px] px-4 text-sm'
          }`}
        >
          <span aria-hidden="true">✨ </span>
          Celebrate Diwali
        </button>
      </section>
      {open && (
        <Suspense fallback={null}>
          <DiwaliGame onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
