import { useMemo, useState } from 'react';
import { Megaphone, CalendarDays, ChevronDown } from 'lucide-react';
import { MobileStatusPill } from '../../components/MobileStatusPill.jsx';
import { formatDate } from '../../utils/formatters.js';

const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Phone announcements list with a month filter (client-side over the same list the desktop shows). */
export function MobileAnnouncementsView({ announcements, loading }) {
  const [month, setMonth] = useState('ALL');

  // Only months that actually have announcements.
  const months = useMemo(() => {
    const seen = new Map();
    for (const a of announcements || []) {
      if (!a.publishDate) continue;
      const key = monthKey(a.publishDate);
      if (!seen.has(key)) seen.set(key, new Date(a.publishDate).toLocaleString('en-IN', { month: 'short', year: 'numeric' }));
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [announcements]);

  const shown = useMemo(
    () => (month === 'ALL' ? announcements || [] : (announcements || []).filter((a) => a.publishDate && monthKey(a.publishDate) === month)),
    [announcements, month]
  );
  const monthLabel = month === 'ALL' ? 'All' : months.find((m) => m.key === month)?.label || 'All';

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-zm-text tracking-tight">Announcements</h1>
        {months.length > 0 && (
          <label className="relative inline-flex items-center gap-2 h-10 px-3.5 rounded-full bg-zm-card border border-zm-green/40 text-sm font-semibold text-zm-green-light">
            <CalendarDays size={15} aria-hidden="true" />
            <span aria-hidden="true">{monthLabel}</span>
            <ChevronDown size={15} aria-hidden="true" />
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Filter announcements by month"
              className="absolute inset-0 opacity-0 cursor-pointer"
            >
              <option value="ALL">All</option>
              {months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loading ? (
        [1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-zm-card animate-pulse" />)
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16">
          <span className="w-24 h-24 rounded-full bg-zm-card border border-zm-border text-zm-green-light flex items-center justify-center" aria-hidden="true">
            <Megaphone size={34} />
          </span>
          <p className="mt-5 text-lg font-bold text-zm-text">No announcements yet</p>
          <p className="mt-1 text-sm text-zm-muted max-w-xs">Company announcements will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((a) => (
            <li key={a._id} className="rounded-2xl bg-zm-card border border-zm-border p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-bold text-zm-text leading-snug">{a.title}</h2>
                <MobileStatusPill priority={a.priority} className="shrink-0" />
              </div>
              <p className="text-sm text-zm-muted leading-relaxed whitespace-pre-line">{a.content}</p>
              <p className="text-xs text-zm-muted/80">Published {formatDate(a.publishDate)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
