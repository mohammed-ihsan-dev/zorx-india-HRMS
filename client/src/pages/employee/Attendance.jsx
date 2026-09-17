import { useEffect, useState } from 'react';
import { CalendarX2 } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Select } from '../../components/Input.jsx';
import * as attendanceService from '../../services/attendanceService.js';
import { formatDate, formatTime, formatMinutes } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const STATUS_OPTIONS = ['', 'PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE'];

export function Attendance() {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setLoading(true);
    attendanceService
      .getMyAttendanceHistory({ status: status || undefined })
      .then((res) => setRecords(res.data))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [status, toast]);

  const summary = records.reduce(
    (acc, r) => {
      acc.total += r.totalWorkingMinutes || 0;
      if (r.status === 'PRESENT') acc.present += 1;
      if (r.status === 'LATE') acc.late += 1;
      if (r.status === 'ABSENT') acc.absent += 1;
      if (r.status === 'LEAVE') acc.leave += 1;
      return acc;
    },
    { present: 0, late: 0, absent: 0, leave: 0, total: 0 }
  );

  const columns = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'checkIn', header: 'Check In', render: (r) => (r.checkIn ? formatTime(r.checkIn.timestamp) : '—') },
    { key: 'checkOut', header: 'Check Out', render: (r) => (r.checkOut ? formatTime(r.checkOut.timestamp) : '—') },
    { key: 'working', header: 'Working Hours', render: (r) => formatMinutes(r.totalWorkingMinutes) },
    { key: 'break', header: 'Break', render: (r) => formatMinutes(r.breakMinutes) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryStat label="Present" value={summary.present} tone="green" />
        <SummaryStat label="Late" value={summary.late} tone="amber" />
        <SummaryStat label="Absent" value={summary.absent} tone="red" />
        <SummaryStat label="Total Hours" value={formatMinutes(summary.total)} tone="default" />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4 gap-4">
          <h3 className="font-semibold text-slate-900">Attendance History</h3>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s || 'All statuses'}
              </option>
            ))}
          </Select>
        </div>
        <Table
          columns={columns}
          data={records}
          loading={loading}
          emptyState={<EmptyState icon={CalendarX2} title="No attendance records" description="Your attendance history will appear here." />}
        />
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, tone }) {
  const toneClasses = {
    default: 'text-brand-800 bg-brand-50',
    green: 'text-brand-800 bg-brand-50',
    amber: 'text-amber-700 bg-amber-50',
    red: 'text-red-700 bg-red-50',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-lg font-bold mt-1 inline-block px-2 py-0.5 rounded ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}
