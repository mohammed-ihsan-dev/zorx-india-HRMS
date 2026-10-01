import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  CalendarClock,
  Clock3,
  Megaphone,
  Activity,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Building2,
  RotateCcw,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { StatCard } from '../../components/StatCard.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { AttendanceWidget } from '../../features/attendance/AttendanceWidget.jsx';
import { WorkingHoursCard } from '../../features/attendance/WorkingHoursCard.jsx';
import { useTodayAttendance } from '../../features/attendance/useTodayAttendance.js';
import * as dashboardService from '../../services/dashboardService.js';
import { formatDate, formatDateTime } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { useAuth } from '../../hooks/useAuth.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { CardSkeleton } from '../../components/Skeleton.jsx';
import { useCountUp, usePrefersReducedMotion } from '../../hooks/useCountUp.js';

const STATUS_COLORS = ['#1f5138', '#0ea5e9', '#f59e0b'];
const PRIORITY_BADGES = {
  URGENT: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
  LOW: 'bg-slate-100 text-slate-700 border-slate-200',
};

function MyPunchStation() {
  const attendance = useTodayAttendance();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <AttendanceWidget data={attendance} />
      </div>
      <div className="lg:col-span-1">
        <WorkingHoursCard data={attendance} />
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const toast = useToast();
  const { user } = useAuth();
  const isHr = user?.role === 'ADMIN';
  const reducedMotion = usePrefersReducedMotion();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('all');

  // Animation states for progress bar and employee workload bars
  const [animatedProgressWidth, setAnimatedProgressWidth] = useState(0);
  const [animateWorkloadBars, setAnimateWorkloadBars] = useState(false);

  const fetchDashboardData = useCallback((selectedRange) => {
    setLoading(true);
    setError(null);
    dashboardService
      .getAdminDashboard(selectedRange)
      .then((resData) => {
        setData(resData);
      })
      .catch((err) => {
        const msg = getErrorMessage(err);
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    fetchDashboardData(range);
  }, [fetchDashboardData, range]);

  const summary = data?.summary || {
    totalWork: 0,
    completed: 0,
    ongoing: 0,
    remaining: 0,
    overdue: 0,
    completionRate: 0,
  };

  // Trigger progress bar & workload bar entrance animation from 0 to real value
  useEffect(() => {
    if (!data) return;
    setAnimatedProgressWidth(0);
    setAnimateWorkloadBars(false);

    const timer = setTimeout(() => {
      setAnimatedProgressWidth(summary.completionRate);
      setAnimateWorkloadBars(true);
    }, 60);

    return () => clearTimeout(timer);
  }, [data, summary.completionRate, range]);

  const handleRangeChange = (e) => {
    const newRange = e.target.value;
    setRange(newRange);
  };

  const animatedCompletionRate = useCountUp(summary.completionRate, 700);

  if (loading && !data) {
    return (
      <div className="space-y-6 pb-8">
        <div className="h-24 bg-slate-100 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-12 text-center bg-white rounded-3xl border border-red-100 shadow-sm space-y-4 my-8">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle size={24} />
        </div>
        <h3 className="text-xl font-extrabold text-slate-900">Unable to load dashboard analytics</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={() => fetchDashboardData(range)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-800 text-white font-bold text-sm shadow-sm hover:bg-brand-900 transition-colors"
        >
          <RotateCcw size={16} />
          Retry
        </button>
      </div>
    );
  }

  const statusDistribution = (data?.statusDistribution || []).filter((d) => d.value > 0);
  const progressOverTime = data?.progressOverTime || [];
  const employeeWorkload = data?.employeeWorkload || [];
  const clientWorkload = data?.clientWorkload || [];
  const priorityDistribution = data?.priorityDistribution || [];
  const upcomingDeadlines = data?.upcomingDeadlines || [];
  const overdueWorkList = data?.overdueWorkList || [];

  return (
    <div className="space-y-8 pb-8 transition-opacity duration-300">
      {/* Top Header & Range Controls */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 hover:shadow-md">
        <div>
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-brand-700 bg-brand-50 px-3 py-1 rounded-md border border-brand-200/60">
            ZORX Management Analytics
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            Admin Dashboard
          </h2>
          <p className="text-sm sm:text-base text-slate-500 mt-1">
            Real-time analytics for work progress, workloads, deadlines, and workforce metrics.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs transition-colors hover:border-slate-300">
            <Calendar size={16} className="text-slate-400" />
            <select
              value={range}
              onChange={handleRangeChange}
              className="bg-transparent text-xs sm:text-sm font-extrabold text-slate-800 border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month (30 Days)</option>
              <option value="3months">Last 3 Months</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => fetchDashboardData(range)}
            title="Refresh Data"
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-xs active:scale-95"
          >
            <RotateCcw size={16} className={loading ? 'animate-spin text-brand-700' : ''} />
          </button>
        </div>
      </div>

      {isHr && <MyPunchStation />}

      {/* Top Real Analytics Summary Cards — 7 Responsive Stat Cards with Visible Count-Up Animations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <StatCard key={`stat-total-${range}-${summary.totalWork}`} label="Total Work" value={summary.totalWork} icon={Briefcase} />
        <StatCard key={`stat-completed-${range}-${summary.completed}`} label="Completed" value={summary.completed} icon={CheckCircle2} tone="green" />
        <StatCard key={`stat-ongoing-${range}-${summary.ongoing}`} label="Ongoing" value={summary.ongoing} icon={Clock} tone="blue" />
        <StatCard key={`stat-remaining-${range}-${summary.remaining}`} label="Remaining" value={summary.remaining} icon={AlertCircle} tone="amber" />
        <StatCard key={`stat-overdue-${range}-${summary.overdue}`} label="Overdue Work" value={summary.overdue} icon={AlertTriangle} tone="red" />
        <StatCard key={`stat-emp-${range}-${data?.totalEmployees}`} label="Employees" value={data?.totalEmployees || 0} icon={Users} tone="slate" />
        <StatCard key={`stat-cli-${range}-${data?.totalClients}`} label="Clients" value={data?.totalClients || 0} icon={Building2} tone="slate" />
      </div>

      {/* Today's Attendance — always TODAY, independent of the "All Time" work
          analytics filter above. Total Employees is shown once already (the
          Employees card above); this section only adds what's missing. */}
      <Card className="flex flex-col transition-all duration-300 hover:shadow-md">
        <CardHeader
          title="Today's Attendance"
          subtitle={data?.attendanceDate ? `Workforce attendance for ${formatDate(data.attendanceDate)}` : 'Workforce attendance for today'}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 p-6 pt-0">
          <StatCard key={`stat-present-${data?.present}`} label="Present" value={data?.present ?? 0} icon={CheckCircle2} tone="green" />
          <StatCard key={`stat-absent-${data?.absent}`} label="Absent" value={data?.absent ?? 0} icon={AlertTriangle} tone="red" />
          <StatCard key={`stat-late-${data?.late}`} label="Late" value={data?.late ?? 0} icon={Clock3} tone="amber" />
          <StatCard key={`stat-halfday-${data?.halfDay}`} label="Half Day" value={data?.halfDay ?? 0} icon={Clock} tone="blue" />
          <StatCard key={`stat-leave-${data?.onLeave}`} label="Leave Taken" value={data?.onLeave ?? 0} icon={CalendarClock} tone="slate" />
        </div>
      </Card>

      {/* Row 2: Overall Work Progress & Work Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Overall Work Progress (Card 1) */}
        <Card className="lg:col-span-1 flex flex-col justify-between transition-all duration-300 hover:shadow-md">
          <CardHeader title="Overall Work Progress" subtitle="Completion rate calculated from database" />
          <div className="p-6 flex-1 flex flex-col justify-center items-center text-center">
            <div className="relative inline-flex items-center justify-center my-4">
              <div className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight transition-transform duration-300">
                {animatedCompletionRate}%
              </div>
            </div>

            {/* Progress Bar with 0% -> Target% CSS Fill Animation */}
            <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden my-4 border border-slate-200/60">
              <div
                className="bg-brand-700 h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, animatedProgressWidth))}%` }}
              />
            </div>

            <div className="w-full grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 text-xs font-bold">
              <div className="p-2.5 rounded-xl bg-brand-50 border border-brand-200/50 text-brand-900 transition-all hover:scale-102">
                <span className="block text-[10px] uppercase text-brand-700 tracking-wider">Completed</span>
                <span className="text-base font-black">{summary.completed}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200/50 text-sky-900 transition-all hover:scale-102">
                <span className="block text-[10px] uppercase text-sky-700 tracking-wider">Ongoing</span>
                <span className="text-base font-black">{summary.ongoing}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/50 text-amber-900 transition-all hover:scale-102">
                <span className="block text-[10px] uppercase text-amber-700 tracking-wider">Remaining</span>
                <span className="text-base font-black">{summary.remaining}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Work Status Distribution Donut Chart (Card 2) */}
        <Card className="lg:col-span-2 flex flex-col transition-all duration-300 hover:shadow-md">
          <CardHeader title="Work Status Distribution" subtitle="Actual MongoDB work item status counts" />
          <div className="p-6 flex-1 flex flex-col justify-center">
            {statusDistribution.length === 0 ? (
              <EmptyState title="No work data available for this period." />
            ) : (
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart key={`pie-${range}-${summary.totalWork}-${summary.completed}`}>
                    <Pie
                      data={statusDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={4}
                      isAnimationActive={!reducedMotion}
                      animationDuration={750}
                      animationEasing="ease-out"
                      animationBegin={50}
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      animationDuration={200}
                      contentStyle={{
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 13, fontWeight: 600 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Row 3: Progress Over Time Timeline Area Chart */}
      <Card className="flex flex-col transition-all duration-300 hover:shadow-md">
        <CardHeader title="Work Progress Over Time" subtitle="Completed work items across historical timeline" />
        <div className="p-6">
          {progressOverTime.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No timeline progress data recorded." />
          ) : (
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart key={`area-${range}-${progressOverTime.length}-${summary.completed}`} data={progressOverTime} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1f5138" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#1f5138" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} />
                  <Tooltip
                    animationDuration={200}
                    contentStyle={{
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="Completed Work"
                    stroke="#1f5138"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorCompleted)"
                    isAnimationActive={!reducedMotion}
                    animationDuration={850}
                    animationEasing="ease-out"
                    animationBegin={50}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Total Work"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                    isAnimationActive={!reducedMotion}
                    animationDuration={850}
                    animationEasing="ease-out"
                    animationBegin={150}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>

      {/* Row 4: Employee Workload & Client Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Employee Workload Horizontal Progress Bars */}
        <Card className="flex flex-col transition-all duration-300 hover:shadow-md">
          <CardHeader title="Employee Workload" subtitle="Work items assigned per employee" />
          <div className="p-6 flex-1 flex flex-col justify-center">
            {employeeWorkload.length === 0 ? (
              <EmptyState title="No workload data available." />
            ) : (
              <div className="space-y-4">
                {employeeWorkload.map((emp) => (
                  <div key={emp.employeeId || emp.employeeName} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span className="truncate max-w-[200px]">{emp.employeeName}</span>
                      <span className="text-slate-500">{emp.completed} / {emp.total} Completed</span>
                    </div>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex border border-slate-200/50">
                      <div
                        style={{ width: animateWorkloadBars ? `${(emp.completed / (emp.total || 1)) * 100}%` : '0%' }}
                        className="bg-brand-700 h-full transition-all duration-700 ease-out"
                        title={`Completed: ${emp.completed}`}
                      />
                      <div
                        style={{ width: animateWorkloadBars ? `${(emp.ongoing / (emp.total || 1)) * 100}%` : '0%' }}
                        className="bg-sky-500 h-full transition-all duration-700 ease-out"
                        title={`Ongoing: ${emp.ongoing}`}
                      />
                      <div
                        style={{ width: animateWorkloadBars ? `${(emp.remaining / (emp.total || 1)) * 100}%` : '0%' }}
                        className="bg-amber-500 h-full transition-all duration-700 ease-out"
                        title={`Remaining: ${emp.remaining}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Client Workload Bar Chart */}
        <Card className="flex flex-col transition-all duration-300 hover:shadow-md">
          <CardHeader title="Work by Client" subtitle="Canonical client work item distribution" />
          <div className="p-6 flex-1 flex flex-col justify-center">
            {clientWorkload.length === 0 ? (
              <EmptyState title="No client data available." />
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart key={`bar-${range}-${clientWorkload.length}-${summary.totalWork}`} data={clientWorkload} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} />
                    <YAxis dataKey="clientName" type="category" width={100} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#334155', fontWeight: 700 }} />
                    <Tooltip
                      animationDuration={200}
                      contentStyle={{
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                    />
                    <Bar
                      dataKey="completed"
                      name="Completed"
                      stackId="a"
                      fill="#1f5138"
                      radius={[0, 0, 0, 0]}
                      isAnimationActive={!reducedMotion}
                      animationDuration={700}
                      animationEasing="ease-out"
                      animationBegin={50}
                    />
                    <Bar
                      dataKey="ongoing"
                      name="Ongoing"
                      stackId="a"
                      fill="#0ea5e9"
                      radius={[0, 0, 0, 0]}
                      isAnimationActive={!reducedMotion}
                      animationDuration={700}
                      animationEasing="ease-out"
                      animationBegin={100}
                    />
                    <Bar
                      dataKey="remaining"
                      name="Remaining"
                      stackId="a"
                      fill="#f59e0b"
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={!reducedMotion}
                      animationDuration={700}
                      animationEasing="ease-out"
                      animationBegin={150}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Row 5: Priority Distribution & Upcoming Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Priority Distribution */}
        <Card className="lg:col-span-1 flex flex-col justify-between transition-all duration-300 hover:shadow-md">
          <CardHeader title="Priority Distribution" subtitle="Work items by urgency level" />
          <div className="p-6 flex-1 flex flex-col justify-center space-y-4">
            {priorityDistribution.map((item) => (
              <div key={item.priority} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100 transition-all hover:bg-slate-100/70">
                <span className={`text-xs font-black px-2.5 py-1 rounded-lg border uppercase ${PRIORITY_BADGES[item.priority] || 'bg-slate-100 text-slate-700'}`}>
                  {item.priority}
                </span>
                <span className="text-xl font-extrabold text-slate-900">{item.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="lg:col-span-2 flex flex-col transition-all duration-300 hover:shadow-md">
          <CardHeader title="Upcoming Deadlines" subtitle="Active work items ordered by deadline" />
          <div className="p-6 flex-1">
            {upcomingDeadlines.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No upcoming deadlines." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Work Item</th>
                      <th className="py-2.5 px-3">Client</th>
                      <th className="py-2.5 px-3">Assigned To</th>
                      <th className="py-2.5 px-3">Deadline</th>
                      <th className="py-2.5 px-3">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                    {upcomingDeadlines.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-900 max-w-[180px] truncate">{item.work}</td>
                        <td className="py-3 px-3 text-slate-600">{item.clientName}</td>
                        <td className="py-3 px-3 text-slate-600">{item.employeeName}</td>
                        <td className="py-3 px-3 text-brand-800 font-extrabold">{formatDate(item.deadline)}</td>
                        <td className="py-3 px-3">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${PRIORITY_BADGES[item.priority] || 'bg-slate-100'}`}>
                            {item.priority}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Row 6: Overdue Work & Recent Activity / Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Overdue Work */}
        <Card className="lg:col-span-1 flex flex-col transition-all duration-300 hover:shadow-md">
          <CardHeader title="Overdue Work Alert" subtitle="Incomplete work past deadline" />
          <div className="p-6 flex-1">
            {overdueWorkList.length === 0 ? (
              <EmptyState title="No overdue work items!" />
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {overdueWorkList.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-xl bg-red-50/60 border border-red-100 space-y-1 transition-all hover:bg-red-50">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-red-900 font-extrabold truncate max-w-[180px]">{item.work}</span>
                      <span className="text-red-700 text-[11px] bg-red-100 px-2 py-0.5 rounded-md border border-red-200">
                        {formatDate(item.deadline)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">
                      Client: <span className="font-bold text-slate-800">{item.clientName}</span> | Assigned: <span className="font-bold text-slate-800">{item.employeeName}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Recent Activity Log */}
        <Card className="lg:col-span-1 flex flex-col transition-all duration-300 hover:shadow-md">
          <CardHeader title="Recent Activity" subtitle="Real-time system events" />
          <div className="p-6 flex-1">
            {(!data?.recentActivity || data.recentActivity.length === 0) ? (
              <EmptyState title="No recent activity logged" />
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {data.recentActivity.map((log) => (
                  <div key={log._id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1 transition-all hover:bg-slate-100/80">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                      <Activity size={14} className="text-brand-700" />
                      <span>{formatDateTime(log.createdAt)}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900 leading-snug">{log.description}</p>
                    <p className="text-[10px] text-slate-400 font-medium">{log.actorId?.email || 'System'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Announcements */}
        <Card className="lg:col-span-1 flex flex-col transition-all duration-300 hover:shadow-md">
          <CardHeader title="Announcements" subtitle="Active company notices" />
          <div className="p-6 flex-1">
            {(!data?.announcements || data.announcements.length === 0) ? (
              <EmptyState icon={Megaphone} title="No active announcements" />
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {data.announcements.map((a) => (
                  <div key={a._id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1 transition-all hover:bg-slate-100/80">
                    <p className="text-sm font-bold text-slate-900">{a.title}</p>
                    <p className="text-xs font-semibold text-slate-400">{formatDate(a.publishDate)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
