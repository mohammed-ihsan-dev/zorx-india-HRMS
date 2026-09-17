import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CalendarDays, Megaphone } from 'lucide-react';
import { AttendanceWidget } from '../../features/attendance/AttendanceWidget.jsx';
import { WorkingHoursCard } from '../../features/attendance/WorkingHoursCard.jsx';
import { useTodayAttendance } from '../../features/attendance/useTodayAttendance.js';
import { TasksSummaryCard } from '../../features/tasks/TasksSummaryCard.jsx';
import { TaskProgressChart } from '../../features/tasks/TaskProgressChart.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useLiveClock } from '../../hooks/useLiveClock.js';
import * as taskService from '../../services/taskService.js';
import * as announcementService from '../../services/announcementService.js';
import { formatDate } from '../../utils/formatters.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function Dashboard() {
  const { user } = useAuth();
  const employee = user?.employee;
  const clock = useLiveClock();
  const attendance = useTodayAttendance();

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  useEffect(() => {
    taskService
      .getMyTasks()
      .then(setTasks)
      .catch(() => {})
      .finally(() => setTasksLoading(false));
    announcementService
      .listAnnouncements()
      .then(setAnnouncements)
      .catch(() => {})
      .finally(() => setAnnouncementsLoading(false));
  }, []);

  return (
    <div className="space-y-8 pb-8">
      {/* Top Greeting Header & Live Clock Banner (Desktop & Tablet view only) */}
      <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between gap-6 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm">
        <div>
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-brand-700 bg-brand-50 px-3 py-1 rounded-md border border-brand-200/60">
            Employee Portal
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-2.5">
            {greeting()}, {employee?.firstName || 'there'} 👋
          </h2>
        </div>

        <div className="flex items-center gap-5 bg-slate-50 border border-slate-200/80 rounded-2xl px-6 py-4 shadow-2xs self-start sm:self-auto">
          <div className="flex items-center gap-2.5">
            <Clock size={22} className="text-brand-800 shrink-0" />
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums tracking-tight">{clock.time}</span>
          </div>
          <div className="w-px h-8 bg-slate-300 shrink-0" />
          <div className="flex items-center gap-2.5">
            <CalendarDays size={22} className="text-brand-800 shrink-0" />
            <span className="text-base sm:text-lg font-extrabold text-slate-700 tracking-wide">{clock.dateShort}</span>
          </div>
        </div>
      </div>

      {/* Main Grid Hierarchy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Attendance Punch Widget - Dominant Position */}
        <div className="order-1 lg:order-1 lg:col-span-2">
          <AttendanceWidget data={attendance} />
        </div>

        {/* Working Hours Tracker */}
        <div className="order-2 lg:order-2 lg:col-span-1">
          <WorkingHoursCard data={attendance} />
        </div>

        {/* My Tasks Summary */}
        <div className="order-3 lg:order-3 lg:col-span-1">
          <TasksSummaryCard tasks={tasks} loading={tasksLoading} />
        </div>

        {/* Announcements Card */}
        <div className="order-4 lg:order-4 lg:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader
              title="Company Announcements"
              subtitle="Latest news and updates from ZORX INDIA management"
              action={
                <Link to="/announcements" className="text-base font-bold text-brand-800 hover:text-brand-900 hover:underline">
                  View all →
                </Link>
              }
            />
            {announcementsLoading ? (
              <div className="flex-1 animate-pulse min-h-[150px] bg-slate-100 rounded-xl" />
            ) : announcements.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-8">
                <EmptyState icon={Megaphone} title="No active announcements" />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {announcements.slice(0, 3).map((a) => (
                  <div key={a._id} className="py-4.5 first:pt-0 last:pb-0 space-y-1">
                    <p className="text-base sm:text-lg font-bold text-slate-900">{a.title}</p>
                    <p className="text-base text-slate-600 line-clamp-2 leading-relaxed">{a.content}</p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-400 pt-1">{formatDate(a.publishDate)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Task Progress Chart */}
        <div className="order-5 lg:order-5 lg:col-span-3">
          <TaskProgressChart tasks={tasks} loading={tasksLoading} />
        </div>
      </div>
    </div>
  );
}
