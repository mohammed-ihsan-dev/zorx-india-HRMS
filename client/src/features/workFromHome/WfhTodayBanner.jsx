import { useEffect, useState } from 'react';
import { House } from 'lucide-react';
import * as wfhService from '../../services/wfhService.js';

/**
 * Display-only notice for the Punch Station. The backend alone decides whether
 * the office-radius check is skipped (approved WFH for today); a failed lookup
 * here just hides the banner and never affects check-in.
 */
export function WfhTodayBanner({ record }) {
  const [approvedToday, setApprovedToday] = useState(false);
  const [defaultWfh, setDefaultWfh] = useState(false);

  useEffect(() => {
    let cancelled = false;
    wfhService
      .getMyWfhToday()
      .then((data) => {
        if (cancelled) return;
        setApprovedToday(Boolean(data?.approved));
        setDefaultWfh(Boolean(data?.defaultWfh));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!approvedToday && record?.attendanceMode !== 'WFH') return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900">
      <House size={20} className="shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider">Work From Home</p>
        <p className="text-sm font-medium mt-0.5">
          {defaultWfh ? 'You are configured to work from home.' : 'You’re approved to work from home today.'}
        </p>
      </div>
    </div>
  );
}
