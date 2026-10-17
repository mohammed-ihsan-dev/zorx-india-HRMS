import { useCallback, useEffect, useState } from 'react';
import { Wifi, WifiOff, LoaderCircle, RotateCcw } from 'lucide-react';
import * as attendanceService from '../../services/attendanceService.js';

/**
 * Company Wi-Fi mode only. Shows "verified" strictly from the server's answer
 * for this request; check-in/check-out are still enforced by the backend.
 */
export function NetworkStatusBanner() {
  const [status, setStatus] = useState('checking'); // checking | verified | unverified | unconfigured | error

  const check = useCallback(() => {
    setStatus('checking');
    attendanceService
      .getNetworkStatus()
      .then((data) => {
        if (data.mode !== 'WIFI') setStatus('verified');
        else if (!data.configured) setStatus('unconfigured');
        else setStatus(data.verified ? 'verified' : 'unverified');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(check, [check]);

  const view = {
    checking: { tone: 'border-slate-200 bg-slate-50 text-slate-700', Icon: LoaderCircle, spin: true, title: 'Company Wi-Fi attendance', text: 'Verifying your company network…' },
    verified: { tone: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: Wifi, title: 'Company Wi-Fi attendance', text: 'Connected to the company network. You can check in and out.' },
    unverified: { tone: 'border-amber-200 bg-amber-50 text-amber-900', Icon: WifiOff, title: 'Company Wi-Fi attendance', text: 'Your company network could not be verified. Connect to the office Wi-Fi to check in or out.' },
    unconfigured: { tone: 'border-red-200 bg-red-50 text-red-800', Icon: WifiOff, title: 'Company Wi-Fi attendance', text: 'Company Wi-Fi attendance is not configured yet. Please contact HR/Admin.' },
    error: { tone: 'border-red-200 bg-red-50 text-red-800', Icon: WifiOff, title: 'Company Wi-Fi attendance', text: 'Could not verify your network right now. Please try again.' },
  }[status];

  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${view.tone}`}>
      <view.Icon size={20} className={`shrink-0 mt-0.5 ${view.spin ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wider">{view.title}</p>
        <p className="text-sm font-medium mt-0.5">{view.text}</p>
      </div>
      {status !== 'checking' && status !== 'verified' && (
        <button type="button" onClick={check} className="shrink-0 inline-flex items-center gap-1 text-xs font-bold underline-offset-2 hover:underline">
          <RotateCcw size={13} /> Check again
        </button>
      )}
    </div>
  );
}
