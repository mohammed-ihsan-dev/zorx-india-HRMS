import { useEffect, useState } from 'react';
import { CalendarX2, CheckCircle2, Clock, UserX, Clock3, Calendar, Search, RotateCcw } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Select } from '../../components/Input.jsx';
import * as attendanceService from '../../services/attendanceService.js';
import { formatDate, formatTime, formatMinutes } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useTodayAttendance } from '../../features/attendance/useTodayAttendance.js';
import { TodayAttendanceTimeline } from '../../features/attendance/TodayAttendanceTimeline.jsx';

const STATUS_OPTIONS = ['', 'PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE'];

export function Attendance() {
  const toast = useToast();
  const { record: todayRecord, loading: todayLoading } = useTodayAttendance();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = {
      status: status || undefined,
      from: selectedDate || undefined,
      to: selectedDate || undefined,
    };
    attendanceService
      .getMyAttendanceHistory(params)
      .then((res) => setRecords(res.data))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [selectedDate, status, toast]);

  const summary = records.reduce(
    (acc, r) => {
      if (r.status === 'PRESENT') acc.present += 1;
      if (r.status === 'LATE') acc.late += 1;
      if (r.status === 'HALF_DAY') acc.halfDay += 1;
      if (r.status === 'ABSENT') acc.absent += 1;
      return acc;
    },
    { present: 0, late: 0, halfDay: 0, absent: 0 }
  );

  const filteredRecords = records.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const dateStr = formatDate(r.date).toLowerCase();
    const statusStr = (r.status || '').toLowerCase();
    return dateStr.includes(q) || statusStr.includes(q);
  });

  const columns = [
    { key: 'date', header: 'Date', render: (r) => <span className="font-semibold text-slate-800">{formatDate(r.date)}</span> },
    { key: 'checkIn', header: 'Check In', render: (r) => (r.checkIn ? <span className="font-medium text-slate-700">{formatTime(r.checkIn.timestamp)}</span> : '—') },
    { key: 'checkOut', header: 'Check Out', render: (r) => (r.checkOut ? <span className="font-medium text-slate-700">{formatTime(r.checkOut.timestamp)}</span> : '—') },
    { key: 'working', header: 'Working Hours', render: (r) => <span className="font-bold text-slate-900">{formatMinutes(r.totalWorkingMinutes)}</span> },
    { key: 'break', header: 'Break', render: (r) => <span className="text-slate-600">{formatMinutes(r.breakMinutes)}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-8 pb-8">
      {/* Page Header */}
      <div>
        <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-brand-700 bg-brand-50 px-3 py-1 rounded-md border border-brand-200/60">
          Attendance Analytics
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-2">
          My Attendance
        </h2>
        <p className="text-base text-slate-500 mt-1">Track your attendance summary, working hours, and monthly logs.</p>
      </div>

      {/* Enlarged Summary Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        <SummaryStat label="Present" value={summary.present} tone="green" icon={CheckCircle2} />
        <SummaryStat label="Late" value={summary.late} tone="amber" icon={Clock} />
        <SummaryStat label="Half Day" value={summary.halfDay} tone="blue" icon={Clock3} />
        <SummaryStat label="Absent" value={summary.absent} tone="red" icon={UserX} />
      </div>

      {/* Today's Attendance Visual Timeline */}
      <TodayAttendanceTimeline record={todayRecord} loading={todayLoading} />

      {/* Attendance Log Table Card with Go-to-Date & Search */}
      <Card className="rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4 border-b border-slate-100 pb-5">
          <div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Attendance Logs</h3>
            <p className="text-sm text-slate-500 mt-1">Detailed history of check-in, check-out, and break durations.</p>
          </div>

          {/* Go to Date & Search Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Text Search */}
            <div className="relative flex-1 sm:w-48 min-w-[160px]">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-600 bg-white shadow-2xs"
              />
            </div>

            {/* Go To Date Picker */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <Calendar size={18} className="text-brand-800 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0 hidden sm:inline">Go to Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm font-semibold text-slate-800 outline-none cursor-pointer"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  title="Clear date filter"
                  className="text-xs font-bold text-slate-400 hover:text-slate-700 px-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Filter */}
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-40 text-sm font-semibold py-1.5">
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s ? s.replace('_', ' ') : 'All Statuses'}
                </option>
              ))}
            </Select>

            {/* Reset All Filters Button */}
            {(selectedDate || status || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDate('');
                  setStatus('');
                  setSearchQuery('');
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:text-brand-800 bg-slate-100 hover:bg-brand-50 rounded-xl border border-slate-200 transition-all"
              >
                <RotateCcw size={14} /> Clear
              </button>
            )}
          </div>
        </div>

        <Table
          columns={columns}
          data={filteredRecords}
          loading={loading}
          emptyState={
            <EmptyState
              icon={CalendarX2}
              title="No attendance records found"
              description={
                selectedDate
                  ? `No record found for ${selectedDate}. Try selecting another date.`
                  : "Your daily attendance history will appear here."
              }
            />
          }
        />
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, tone, icon: Icon }) {
  const styles = {
    green: {
      bg: 'bg-gradient-to-br from-emerald-500/10 via-emerald-50/40 to-white',
      border: 'border-emerald-200/90',
      text: 'text-emerald-950',
      iconBg: 'bg-emerald-100/80 text-emerald-800',
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-500/10 via-amber-50/40 to-white',
      border: 'border-amber-200/90',
      text: 'text-amber-950',
      iconBg: 'bg-amber-100/80 text-amber-800',
    },
    blue: {
      bg: 'bg-gradient-to-br from-sky-500/10 via-sky-50/40 to-white',
      border: 'border-sky-200/90',
      text: 'text-sky-950',
      iconBg: 'bg-sky-100/80 text-sky-800',
    },
    red: {
      bg: 'bg-gradient-to-br from-rose-500/10 via-rose-50/40 to-white',
      border: 'border-rose-200/90',
      text: 'text-rose-950',
      iconBg: 'bg-rose-100/80 text-rose-800',
    },
  };

  const style = styles[tone] || styles.green;

  return (
    <div className={`p-6 sm:p-7 rounded-3xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${style.iconBg}`}>
          <Icon size={22} />
        </div>
      </div>
      <p className={`text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mt-3.5 ${style.text}`}>
        {value}
      </p>
    </div>
  );
}
