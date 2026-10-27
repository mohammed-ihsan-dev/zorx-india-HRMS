import { useState } from 'react';
import { ClipboardList, History as HistoryIcon, Plus, CalendarDays, Trash2, SearchX } from 'lucide-react';
import { MobileStatusPill } from '../../components/MobileStatusPill.jsx';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { balanceTone } from './balanceTone.js';

const LEAVE_TYPE_ORDER = ['CASUAL', 'SICK', 'PAID'];

// Card accent per tone; the text always states the balance too, so colour is never the only cue.
const TONE_CLASS = {
  green: { card: 'bg-zm-green/15 border-zm-green-light/40', label: 'text-zm-green-light', value: 'text-zm-pista' },
  red: { card: 'bg-rose-500/10 border-rose-400/40', label: 'text-rose-300', value: 'text-rose-100' },
  amber: { card: 'bg-amber-500/10 border-amber-400/40', label: 'text-amber-300', value: 'text-amber-100' },
  neutral: { card: 'bg-zm-card border-zm-border', label: 'text-zm-muted', value: 'text-zm-text' },
};

/** Same wording/rules as the desktop balance cards, condensed. */
function balanceText(type, info) {
  if (type === 'CASUAL') return info.available > 0 ? `${info.available} available` : 'None available';
  if (type === 'SICK' && !info.eligibleNow) {
    return info.eligibleFrom
      ? `From ${formatDate(info.eligibleFrom, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
      : 'Needs joining date';
  }
  if (info.allowance === null) return `${info.used} used this month`;
  return `${Math.max(0, info.allowance - info.used)} / ${info.allowance} left`;
}

/** Phone leave page: Pending/History tabs + add button. Data and actions come from the Leave page. */
export function MobileLeaveView({ leaves, summary, loading, onOpenRequest, onOpenDetail, onRequestCancel }) {
  const [tab, setTab] = useState('pending');

  const pending = (leaves || []).filter((l) => l.status === 'PENDING');
  const history = (leaves || []).filter((l) => l.status !== 'PENDING');
  const shown = tab === 'pending' ? pending : history;

  const tabClass = (active) =>
    `flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
      active ? 'bg-zm-elev text-zm-green-light border border-zm-green/40' : 'text-zm-muted'
    }`;

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <h1 className="text-2xl font-extrabold text-zm-text tracking-tight">Leave</h1>

      <div role="tablist" aria-label="Leave requests" className="flex gap-1 p-1 rounded-2xl bg-zm-card border border-zm-border">
        <button type="button" role="tab" aria-selected={tab === 'pending'} onClick={() => setTab('pending')} className={tabClass(tab === 'pending')}>
          <ClipboardList size={17} aria-hidden="true" /> Pending
          {pending.length > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-zm-green text-white text-[11px] flex items-center justify-center">{pending.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')} className={tabClass(tab === 'history')}>
          <HistoryIcon size={17} aria-hidden="true" /> History
        </button>
      </div>

      {summary?.types && (
        <ul aria-label="Leave balances" className="grid grid-cols-3 gap-2">
          {LEAVE_TYPE_ORDER.filter((t) => summary.types[t]).map((type) => {
            const tone = TONE_CLASS[balanceTone(type, summary.types[type])];
            return (
              <li key={type} data-tone={balanceTone(type, summary.types[type])} className={`rounded-2xl border px-3 py-2.5 min-w-0 ${tone.card}`}>
                <p className={`text-[11px] font-bold uppercase tracking-wide ${tone.label}`}>{titleCase(type)}</p>
                <p className={`text-xs font-bold mt-0.5 leading-snug ${tone.value}`}>{balanceText(type, summary.types[type])}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div role="tabpanel" className="space-y-3">
        {loading ? (
          [1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-zm-card animate-pulse" />)
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center text-center py-14">
            <span className="w-20 h-20 rounded-full bg-zm-card border border-zm-border text-zm-green-light flex items-center justify-center" aria-hidden="true">
              <SearchX size={32} />
            </span>
            <p className="mt-4 text-base font-bold text-zm-text">{tab === 'pending' ? 'No pending requests' : 'No leave history yet'}</p>
            <p className="mt-1 text-sm text-zm-muted">{tab === 'pending' ? 'Tap + to request leave.' : 'Approved, rejected and cancelled requests appear here.'}</p>
          </div>
        ) : (
          shown.map((l) => (
            <article key={l._id} className="rounded-2xl bg-zm-card border border-zm-border">
              <button type="button" onClick={() => onOpenDetail?.(l)} className="w-full text-left p-4 space-y-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-zm-text text-sm">{titleCase(l.leaveType)} Leave</span>
                  <MobileStatusPill status={l.status} />
                </span>
                <span className="flex items-center gap-2 text-xs text-zm-muted">
                  <CalendarDays size={14} className="text-zm-green-light shrink-0" aria-hidden="true" />
                  {formatDate(l.startDate)}
                  {l.startDate !== l.endDate && ` – ${formatDate(l.endDate)}`}
                  <span aria-hidden="true">·</span>
                  {l.days} day{l.days > 1 ? 's' : ''}
                </span>
                {l.reason && <span className="block text-xs text-zm-muted line-clamp-1">{l.reason}</span>}
              </button>
              {l.status === 'PENDING' && (
                <div className="px-4 pb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRequestCancel?.(l)}
                    className="h-9 px-3 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-400/30 flex items-center gap-1.5"
                  >
                    <Trash2 size={13} aria-hidden="true" /> Cancel Request
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onOpenRequest}
        aria-label="Request leave"
        className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] z-30 w-14 h-14 rounded-2xl bg-zm-green hover:bg-zm-green-dark active:scale-95 text-white flex items-center justify-center shadow-xl shadow-black/40 transition"
      >
        <Plus size={28} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
