import { MapPin } from 'lucide-react';

/**
 * Display-only notice for the Punch Station on an approved Onsite Work day.
 * The backend alone decides whether the site radius is skipped; this never
 * affects check-in. GPS is still requested and recorded.
 */
export function OnsiteTodayBanner({ onsiteToday }) {
  if (!onsiteToday) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900" role="status">
      <MapPin size={20} className="shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider">Onsite Work approved</p>
        <p className="text-sm font-medium mt-0.5">
          You can check in and out from the onsite location today{onsiteToday.workLocation ? ` (${onsiteToday.workLocation})` : ''}. Your location is still recorded.
        </p>
      </div>
    </div>
  );
}
