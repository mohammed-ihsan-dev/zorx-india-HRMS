import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

/**
 * Purely informational — the HRMS never queues or fakes check-in/leave/task
 * actions while offline. This just tells the user why live data isn't loading.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[200] bg-amber-800 text-white text-sm font-semibold px-4 py-2 flex items-center justify-center gap-2 shadow-md">
      <WifiOff size={16} className="shrink-0" />
      You&apos;re offline. Please reconnect to the internet to use live HRMS features.
    </div>
  );
}
