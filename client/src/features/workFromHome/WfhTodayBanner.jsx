import { useEffect, useState } from 'react';
import { House } from 'lucide-react';
import * as wfhService from '../../services/wfhService.js';

/**
 * Display-only notice for the Punch Station. The backend alone decides whether
 * the office-radius check is skipped (approved WFH for today); a failed lookup
 * here just hides the banner and never affects check-in.
 */
export function WfhTodayBanner({ record, wfhToday }) {
  const [fetched, setFetched] = useState(null);
  // The dashboard already has this answer (wfhToday); fetch only when it wasn't passed.
  const data = wfhToday !== undefined ? wfhToday : fetched;
  const approvedToday = Boolean(data?.approved);
  const defaultWfh = Boolean(data?.defaultWfh);
  const recurringToday = Boolean(data?.recurringToday);

  useEffect(() => {
    if (wfhToday !== undefined) return undefined;
    let cancelled = false;
    wfhService
      .getMyWfhToday()
      .then((result) => {
        if (!cancelled) setFetched(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wfhToday]);

  if (!approvedToday && record?.attendanceMode !== 'WFH') return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900">
      <House size={20} className="shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider">Work From Home</p>
        <p className="text-sm font-medium mt-0.5">
          {defaultWfh
            ? 'You are configured to work from home.'
            : recurringToday
              ? 'Second Saturday — you work from home today (09:30 AM – 06:00 PM).'
              : 'You’re approved to work from home today.'}
        </p>
      </div>
    </div>
  );
}
