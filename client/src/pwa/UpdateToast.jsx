import { RefreshCw } from 'lucide-react';
import { useAppUpdate } from './AppUpdateContext.jsx';

const WAITING_TEXT = {
  saving: 'New version ready — it will install right after your request finishes.',
  dialog: 'New version ready — it will install when you finish what you’re doing.',
  unsaved: 'New version ready — it will install when you finish what you’re doing.',
  active: 'Installing the new version…',
};

/**
 * Fallback for automatic updates: shown while a ready update waits for a safe
 * moment (or if it couldn't be applied). Refresh warns before discarding
 * unsaved input; Later postpones automatic installing for a while.
 */
export function UpdateToast() {
  const { ready, blockedBy, snoozed, refreshNow, later } = useAppUpdate();
  if (!ready || snoozed) return null;

  return (
    <div
      role="status"
      className="zm-update-toast fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 z-[200] max-w-sm sm:ml-auto bg-brand-950 text-white rounded-2xl shadow-popover border border-brand-800 px-4 py-3.5 flex items-center gap-3"
    >
      <RefreshCw size={18} className="text-brand-200 shrink-0" />
      <p className="text-sm font-semibold flex-1 text-white">{WAITING_TEXT[blockedBy] || 'New version available. Refresh to update.'}</p>
      <button
        onClick={refreshNow}
        className="text-xs font-extrabold uppercase tracking-wide bg-brand-100 text-brand-900 px-3 py-1.5 rounded-lg hover:bg-white transition-colors shrink-0"
      >
        Refresh
      </button>
      <button onClick={later} className="text-brand-300 hover:text-white text-xs font-semibold shrink-0" aria-label="Dismiss">
        Later
      </button>
    </div>
  );
}
