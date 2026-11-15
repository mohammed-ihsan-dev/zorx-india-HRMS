import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CalendarClock, ListChecks, Megaphone, ChevronRight, RefreshCw, PartyPopper, Activity } from 'lucide-react';
import * as dashboardService from '../../services/dashboardService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { afterAttendance } from '../attendance/attendanceBoot.js';
import { formatDate } from '../../utils/formatters.js';

/**
 * Phone dashboard summary for HR and Super Admin — real numbers from the existing
 * admin dashboard API (GET /dashboard/admin), nothing invented. Loads after the
 * personal attendance card (attendance-first) and never blocks it.
 */
function Stat({ label, value, tone }) {
  return (
    <div className="rounded-2xl bg-zm-elev px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-zm-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value ?? '—'}</p>
    </div>
  );
}

function LinkCard({ to, icon: Icon, title, value, detail, accent = 'text-zm-accent-light' }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-2xl bg-zm-card border border-zm-border p-4 active:bg-white/5">
      <span className="flex items-center gap-3 min-w-0">
        <span className={`w-10 h-10 rounded-xl bg-zm-accent/15 ${accent} flex items-center justify-center shrink-0`} aria-hidden="true">
          <Icon size={19} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zm-text truncate">{title}</span>
          {detail && <span className="block text-xs text-zm-muted truncate">{detail}</span>}
        </span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {value !== undefined && <span className="text-lg font-extrabold text-zm-text tabular-nums">{value}</span>}
        <ChevronRight size={18} className="text-zm-muted" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function ManagementOverview({ approvalsPath }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');
    afterAttendance()
      .then(() => dashboardService.getAdminDashboard())
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load the overview.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  if (loading && !data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-44 rounded-3xl bg-zm-card animate-pulse" />
        <div className="h-16 rounded-2xl bg-zm-card animate-pulse" />
        <div className="h-16 rounded-2xl bg-zm-card animate-pulse" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="rounded-2xl bg-zm-card border border-zm-border p-4 text-sm text-zm-muted flex items-center justify-between gap-3" role="alert">
        <span>{error}</span>
        <button type="button" onClick={load} className="h-10 px-3 rounded-xl bg-zm-elev text-zm-accent-light font-semibold flex items-center gap-1.5">
          <RefreshCw size={15} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  const s = data.summary || {};
  const announcements = (data.announcements || []).slice(0, 2);
  return (
    <div className="space-y-3">
      <section aria-label="Today's attendance" className="rounded-3xl bg-zm-card border border-zm-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-zm-text flex items-center gap-2">
            <Activity size={16} className="text-zm-accent-light" aria-hidden="true" /> Today&apos;s attendance
          </h2>
          <Link to="/admin/attendance" className="text-xs font-semibold text-zm-accent-light">
            View all
          </Link>
        </div>
        {data.holidayToday && (
          <p className="mb-3 text-xs font-semibold text-amber-300 flex items-center gap-1.5">
            <PartyPopper size={14} aria-hidden="true" /> Holiday: {data.holidayToday}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Present" value={data.present} tone="text-zm-success" />
          <Stat label="Late" value={data.late} tone="text-amber-300" />
          <Stat label="Absent" value={data.absent} tone="text-red-400" />
          <Stat label="On leave" value={data.onLeave} tone="text-zm-accent-light" />
        </div>
        <p className="mt-3 text-xs text-zm-muted">
          {data.currentlyWorking ?? 0} working now{data.halfDay ? ` · ${data.halfDay} half day` : ''}
        </p>
      </section>

      <LinkCard to={approvalsPath} icon={CalendarClock} title="Pending leave requests" detail="Review and decide" value={data.pendingLeaves ?? 0} />
      <LinkCard to="/admin/employees" icon={Users} title="Employees" detail={`${data.totalClients ?? 0} active clients`} value={data.totalEmployees ?? 0} />
      <LinkCard
        to="/admin/tasks"
        icon={ListChecks}
        title="Tasks"
        detail={`${s.ongoing ?? 0} ongoing · ${s.overdue ?? 0} overdue · ${s.completionRate ?? 0}% done`}
        value={s.totalWork ?? 0}
      />

      <section aria-label="Recent announcements" className="rounded-2xl bg-zm-card border border-zm-border overflow-hidden">
        <Link to="/admin/announcements" className="flex items-center justify-between px-4 py-3 border-b border-zm-border">
          <span className="text-sm font-bold text-zm-text flex items-center gap-2">
            <Megaphone size={16} className="text-zm-accent-light" aria-hidden="true" /> Announcements
          </span>
          <ChevronRight size={18} className="text-zm-muted" aria-hidden="true" />
        </Link>
        {announcements.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zm-muted">No announcements yet.</p>
        ) : (
          <ul className="divide-y divide-zm-border">
            {announcements.map((a) => (
              <li key={a._id} className="px-4 py-3">
                <p className="text-sm font-semibold text-zm-text line-clamp-1">{a.title}</p>
                <p className="text-xs text-zm-muted">{a.publishDate ? formatDate(a.publishDate) : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
