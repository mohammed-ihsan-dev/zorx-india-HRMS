import { ZorxLogo } from './ZorxLogo.jsx';

/**
 * Shown while the session is being restored: the app's outline (logo, an
 * attendance card placeholder, navigation placeholder) instead of a blank
 * spinner. Nothing here is interactive — Check-in only appears once the server
 * has confirmed who is signed in. `connecting`: restoring is taking long
 * (the server waking up after a quiet period) — say so honestly.
 */
export function SessionShell({ connecting = false }) {
  // Same rule as the rest of the phone shell (index.html / pwa/mobileChrome.js).
  const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-zm-chrome') === 'dark';
  return (
    <div className="zm-loading-surface min-h-screen bg-white flex flex-col" aria-busy="true">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 zm-shell-border">
        <ZorxLogo size="navbar" variant={dark ? 'white' : 'black'} />
        <span className="h-8 w-8 rounded-full bg-slate-100 zm-shell-block animate-pulse" aria-hidden="true" />
      </header>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6 space-y-4">
        <section className="rounded-2xl border border-slate-200 zm-shell-border p-5 space-y-4" aria-label="Attendance">
          <p className="text-sm font-semibold text-slate-500">Today&apos;s attendance</p>
          <div className="h-7 w-40 rounded-lg bg-slate-100 zm-shell-block animate-pulse" aria-hidden="true" />
          <div className="h-12 w-full rounded-xl bg-slate-100 zm-shell-block animate-pulse" aria-hidden="true" />
          <p role="status" aria-live="polite" className="text-sm text-slate-500">
            {connecting
              ? 'Connecting to the server… After a quiet period this can take up to a minute.'
              : 'Checking your session…'}
          </p>
        </section>
        <div className="grid grid-cols-2 gap-3" aria-hidden="true">
          <div className="h-20 rounded-2xl bg-slate-100 zm-shell-block animate-pulse" />
          <div className="h-20 rounded-2xl bg-slate-100 zm-shell-block animate-pulse" />
        </div>
      </main>
    </div>
  );
}
