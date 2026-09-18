import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

const DISMISSED_KEY = 'zorx_pwa_install_dismissed';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Subtle, dismissible install nudge — never a blocking modal, never shown
 * again in this browser once dismissed. Android/desktop Chrome get the real
 * native install prompt; iOS Safari (which has no such API) gets a one-line
 * "Share -> Add to Home Screen" hint instead, and only there.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');

  useEffect(() => {
    if (isStandalone() || dismissed) return undefined;

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    if (isIos()) {
      setIosHint(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, [dismissed]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
    setDeferredPrompt(null);
    setIosHint(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  if (dismissed || (!deferredPrompt && !iosHint)) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-4 z-[150] max-w-sm bg-white border border-slate-200 rounded-2xl shadow-popover px-4 py-3.5 flex items-center gap-3">
      {deferredPrompt ? (
        <>
          <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-800 flex items-center justify-center shrink-0">
            <Download size={18} />
          </div>
          <p className="text-sm font-semibold text-slate-800 flex-1">Install ZORX HRMS for quicker access.</p>
          <button
            onClick={handleInstall}
            className="text-xs font-extrabold uppercase tracking-wide bg-brand-800 text-white px-3 py-1.5 rounded-lg hover:bg-brand-900 transition-colors shrink-0"
          >
            Install
          </button>
        </>
      ) : (
        <>
          <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-800 flex items-center justify-center shrink-0">
            <Share size={16} />
          </div>
          <p className="text-sm font-semibold text-slate-800 flex-1">
            To install: tap <span className="font-extrabold">Share</span> → <span className="font-extrabold">Add to Home Screen</span>
          </p>
        </>
      )}
      <button onClick={dismiss} className="text-slate-400 hover:text-slate-700 shrink-0" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}
