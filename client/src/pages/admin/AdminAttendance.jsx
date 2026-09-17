import { useEffect, useState } from 'react';
import { CalendarX2, Coffee } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import * as attendanceService from '../../services/attendanceService.js';
import { formatDate, formatTime, formatMinutes, formatMeters, titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function AdminAttendance() {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
  const [page, setPage] = useState(1);
  const [breaksRecord, setBreaksRecord] = useState(null);

  const load = () => {
    setLoading(true);
    attendanceService
      .listAttendance({
        from: filters.from || undefined,
        to: filters.to || undefined,
        status: filters.status || undefined,
        page,
      })
      .then((res) => {
        setRecords(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">
            {r.employeeId?.firstName} {r.employeeId?.lastName}
          </p>
          <p className="text-xs text-slate-400">{r.employeeId?.employeeCode}</p>
        </div>
      ),
    },
    { key: 'department', header: 'Department', render: (r) => r.employeeId?.departmentId?.name || '—' },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'checkIn', header: 'Check In', render: (r) => (r.checkIn ? formatTime(r.checkIn.timestamp) : '—') },
    { key: 'checkOut', header: 'Check Out', render: (r) => (r.checkOut ? formatTime(r.checkOut.timestamp) : '—') },
    { key: 'working', header: 'Working Hours', render: (r) => formatMinutes(r.totalWorkingMinutes) },
    { key: 'late', header: 'Late', render: (r) => (r.lateMinutes ? formatMinutes(r.lateMinutes) : '—') },
    {
      key: 'location',
      header: 'Location',
      render: (r) => (r.checkIn ? formatMeters(r.checkIn.distanceFromOffice) : '—'),
    },
    {
      key: 'breaks',
      header: 'Breaks',
      render: (r) =>
        r.breaks?.length ? (
          <button
            onClick={() => setBreaksRecord(r)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <Coffee size={13} /> {r.breaks.length} ({formatMinutes(r.breakMinutes)})
          </button>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <Card padded={false} className="p-5">
      <h3 className="font-semibold text-slate-900 mb-4">Attendance Records</h3>
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          type="date"
          className="w-40"
          value={filters.from}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, from: e.target.value }));
          }}
        />
        <Input
          type="date"
          className="w-40"
          value={filters.to}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, to: e.target.value }));
          }}
        />
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, status: e.target.value }));
          }}
        >
          <option value="">All statuses</option>
          <option value="PRESENT">Present</option>
          <option value="LATE">Late</option>
          <option value="HALF_DAY">Half Day</option>
          <option value="ABSENT">Absent</option>
          <option value="LEAVE">Leave</option>
        </Select>
      </div>
      <Table
        columns={columns}
        data={records}
        loading={loading}
        emptyState={<EmptyState icon={CalendarX2} title="No attendance records found" />}
      />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />

      <Modal
        open={Boolean(breaksRecord)}
        onClose={() => setBreaksRecord(null)}
        title="Break Details"
        size="sm"
        footer={
          <Button variant="outline" onClick={() => setBreaksRecord(null)}>
            Close
          </Button>
        }
      >
        {breaksRecord && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              {breaksRecord.employeeId?.firstName} {breaksRecord.employeeId?.lastName} · {formatDate(breaksRecord.date)}
            </p>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {breaksRecord.breaks.map((b, i) => (
                <div key={i} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                  <span className="font-semibold text-slate-700">{titleCase(b.type)}</span>
                  <span className="text-slate-500">
                    {formatTime(b.startTime)} → {b.endTime ? formatTime(b.endTime) : 'Active'}
                  </span>
                  <span className="font-medium text-slate-800">{formatMinutes(b.durationMinutes)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-1 text-sm font-bold text-slate-800">
              <span>Total</span>
              <span>{formatMinutes(breaksRecord.breakMinutes)}</span>
            </div>
            {breaksRecord.extraBreakMinutes > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Exceeded the daily break allowance by {formatMinutes(breaksRecord.extraBreakMinutes)}.
              </p>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
