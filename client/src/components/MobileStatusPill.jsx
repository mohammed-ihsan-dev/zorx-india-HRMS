import { STATUS_COLORS, PRIORITY_COLORS } from '../utils/constants.js';
import { titleCase } from '../utils/formatters.js';

// Dark-surface versions of Badge's colours. The colour *name* still comes from
// the app's own STATUS_COLORS / PRIORITY_COLORS, so meanings never change.
const DARK_TONES = {
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  red: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
  blue: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  slate: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
};

export function MobileStatusPill({ status, priority, className = '' }) {
  const value = status ?? priority;
  if (!value) return null;
  const color = (status ? STATUS_COLORS : PRIORITY_COLORS)[value] || 'slate';
  const label = value === 'REMAINING' ? 'Upcoming' : titleCase(value);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${DARK_TONES[color]} ${className}`}>
      {label}
    </span>
  );
}
