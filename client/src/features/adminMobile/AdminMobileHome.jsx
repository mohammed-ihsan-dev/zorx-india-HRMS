import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarDays } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useTodayAttendance } from '../attendance/useTodayAttendance.js';
import { afterAttendance } from '../attendance/attendanceBoot.js';
import { MobileDashboardView, useUnreadCount } from '../dashboard/MobileDashboardView.jsx';
import { ManagementOverview } from './ManagementOverview.jsx';
import * as taskService from '../../services/taskService.js';
import { formatDate } from '../../utils/formatters.js';
import { ROLES } from '../../utils/constants.js';

/** Header in the Employee phone app's style (Super Admin has no attendance card, which normally carries it). */
function WelcomeHeader({ name, roleLabel }) {
  const unread = useUnreadCount();
  return (
    <div className="sticky -top-3 z-10 -mx-4 px-4 pt-3 pb-2 -mt-3 -mb-2 bg-zm-bg space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zm-muted">Welcome back</p>
          <h1 className="text-xl font-extrabold text-zm-text tracking-tight truncate">{name}</h1>
          <p className="text-[11px] font-bold uppercase tracking-wider text-zm-accent-light mt-0.5">{roleLabel}</p>
        </div>
        <Link
          to="/notifications"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative w-11 h-11 shrink-0 rounded-full border border-zm-accent/50 bg-zm-card text-zm-accent-light flex items-center justify-center"
        >
          <Bell size={20} aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
      </header>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zm-card border border-zm-border text-xs font-semibold text-zm-text">
        <CalendarDays size={14} className="text-zm-accent-light" aria-hidden="true" />
        {formatDate(new Date(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );
}

/**
 * HR phone home: HR is an employee for attendance, so the Employee phone app's own
 * attendance view (same hook, same APIs, same GPS/WFH rules) comes first, then the
 * management overview.
 */
function HrMobileHome() {
  const attendance = useTodayAttendance();
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    afterAttendance()
      .then(() => alive && taskService.getMyTasks())
      .then((data) => alive && data && setTasks(data))
      .catch(() => {})
      .finally(() => alive && setTasksLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="space-y-4">
      <MobileDashboardView attendance={attendance} tasks={tasks} tasksLoading={tasksLoading} />
      <div className="max-w-md mx-auto space-y-3">
        <h2 className="px-1 pt-1 text-xs font-bold uppercase tracking-wider text-zm-muted">HR overview</h2>
        <ManagementOverview approvalsPath="/admin/leaves" />
      </div>
    </div>
  );
}

/** Super Admin phone home: management only — no personal check-in, timer or breaks. */
function SuperAdminMobileHome({ user }) {
  const e = user?.employee;
  const name = e ? `${e.firstName} ${e.lastName || ''}`.trim() : user?.email;
  return (
    <div className="space-y-4 max-w-md mx-auto">
      <WelcomeHeader name={name} roleLabel="Super Admin" />
      <ManagementOverview approvalsPath="/admin/approvals" />
    </div>
  );
}

export function AdminMobileHome() {
  const { user } = useAuth();
  return user?.role === ROLES.SUPER_ADMIN ? <SuperAdminMobileHome user={user} /> : <HrMobileHome />;
}
