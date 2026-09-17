import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, CalendarClock, Clock3, Megaphone, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { StatCard } from '../../components/StatCard.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import * as dashboardService from '../../services/dashboardService.js';
import { formatDate, formatDateTime } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { CardSkeleton } from '../../components/Skeleton.jsx';

const TASK_COLORS = ['#94a3b8', '#0ea5e9', '#f59e0b', '#1f5138', '#ef4444'];

export function AdminDashboard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardService
      .getAdminDashboard()
      .then(setData)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const taskChartData = [
    { name: 'To Do', value: data.taskStats.todo },
    { name: 'In Progress', value: data.taskStats.inProgress },
    { name: 'In Review', value: data.taskStats.inReview },
    { name: 'Completed', value: data.taskStats.completed },
    { name: 'Cancelled', value: data.taskStats.cancelled },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-8 pb-8">
      {/* Top Welcome Section */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-brand-700 bg-brand-50 px-3 py-1 rounded-md border border-brand-200/60">
            Admin & HR Control Center
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            Organization Dashboard
          </h2>
          <p className="text-base text-slate-500 mt-1">Real-time attendance, leave status, and workforce metrics.</p>
        </div>
      </div>

      {/* Top Statistics Grid — 6 Spacious Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <StatCard label="Total Employees" value={data.totalEmployees} icon={Users} />
        <StatCard label="Present Today" value={data.present} icon={UserCheck} />
        <StatCard label="Currently Working" value={data.currentlyWorking} icon={Clock3} tone="blue" />
        <StatCard label="On Leave" value={data.onLeave} icon={CalendarClock} tone="blue" />
        <StatCard label="Absent" value={data.absent} icon={UserX} tone="red" />
        <StatCard label="Late Arrivals" value={data.late} icon={Clock3} tone="amber" />
      </div>

      {/* Charts & Activity Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Task Distribution */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader title="Task Distribution" subtitle="Active tasks by status" />
          {taskChartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <EmptyState title="No task data available" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={taskChartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {taskChartData.map((entry, index) => (
                      <Cell key={entry.name} fill={TASK_COLORS[index % TASK_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '14px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: 13, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Audit / Recent Activity Log */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader title="Recent Activity" subtitle="Real-time system events" />
          {data.recentActivity.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <EmptyState title="No recent activity logged" />
            </div>
          ) : (
            <div className="space-y-4 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
              {data.recentActivity.map((log) => (
                <div key={log._id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <Activity size={14} className="text-brand-700" />
                    <span>{formatDateTime(log.createdAt)}</span>
                  </div>
                  <p className="text-base font-semibold text-slate-900 leading-snug">{log.description}</p>
                  <p className="text-xs text-slate-400 font-medium">{log.actorId?.email || 'System'}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Announcements */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader title="Announcements" subtitle="Active company notices" />
          {data.announcements.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <EmptyState icon={Megaphone} title="No active announcements" />
            </div>
          ) : (
            <div className="space-y-4 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
              {data.announcements.map((a) => (
                <div key={a._id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <p className="text-base font-bold text-slate-900">{a.title}</p>
                  <p className="text-xs font-semibold text-slate-400">{formatDate(a.publishDate)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
