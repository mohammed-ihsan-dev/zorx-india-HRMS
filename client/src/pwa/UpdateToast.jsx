import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

/**
 * Safe update flow: a new deploy is never force-applied while someone is mid
 * check-in/leave-request/etc. — it just offers a refresh, same as the browser
 * would if they reloaded the tab themselves.
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // Non-fatal — the site keeps working as a normal website without a service worker.
      console.error('Service worker registration failed:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 z-[200] max-w-sm sm:ml-auto bg-brand-950 text-white rounded-2xl shadow-popover border border-brand-800 px-4 py-3.5 flex items-center gap-3">
      <RefreshCw size={18} className="text-brand-200 shrink-0" />
      <p className="text-sm font-semibold flex-1">New version available. Refresh to update.</p>
      <button
        onClick={() => updateServiceWorker(true)}
        className="text-xs font-extrabold uppercase tracking-wide bg-brand-100 text-brand-900 px-3 py-1.5 rounded-lg hover:bg-white transition-colors shrink-0"
      >
        Refresh
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="text-brand-300 hover:text-white text-xs font-semibold shrink-0"
        aria-label="Dismiss"
      >
        Later
      </button>
    </div>
  );
}
