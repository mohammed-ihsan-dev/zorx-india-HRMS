import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Loader } from '../../components/Loader.jsx';
import { Table } from '../../components/Table.jsx';
import { StatusBadge, PriorityBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import * as employeeService from '../../services/employeeService.js';
import * as attendanceService from '../../services/attendanceService.js';
import * as taskService from '../../services/taskService.js';
import { formatDate, formatTime, formatMinutes, initials } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function EmployeeDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [employee, setEmployee] = useState(null);
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      employeeService.getEmployee(id),
      attendanceService.getEmployeeAttendance(id),
      taskService.listTasks({ assignedTo: id, limit: 10 }),
    ])
      .then(([empRes, attendanceRes, taskRes]) => {
        setEmployee(empRes.employee);
        setStats(empRes.stats);
        setAttendance(attendanceRes.slice(0, 10));
        setTasks(taskRes.data);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, toast]);

  if (loading) return <Loader />;
  if (!employee) return null;

  const attendanceColumns = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'checkIn', header: 'Check In', render: (r) => (r.checkIn ? formatTime(r.checkIn.timestamp) : '—') },
    { key: 'checkOut', header: 'Check Out', render: (r) => (r.checkOut ? formatTime(r.checkOut.timestamp) : '—') },
    { key: 'working', header: 'Working Hours', render: (r) => formatMinutes(r.totalWorkingMinutes) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <Link to="/admin/employees" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Back to Employees
      </Link>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-xl font-bold">
            {initials(employee.firstName, employee.lastName)}
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-lg font-bold text-slate-900">
              {employee.firstName} {employee.lastName}
            </h2>
            <p className="text-sm text-slate-500">
              {employee.designation} · {employee.employeeCode} · {employee.departmentId?.name || 'No department'}
            </p>
            <Badge color={employee.status === 'ACTIVE' ? 'green' : 'slate'} className="mt-1.5">
              {employee.status}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <MiniStat label="Present" value={stats.presentCount} />
            <MiniStat label="Late" value={stats.lateCount} />
            <MiniStat label="Leave" value={stats.leaveCount} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded={false} className="p-5">
          <CardHeader title="Work Information" />
          <dl className="space-y-3 text-sm">
            <Row label="Phone" value={employee.phone || '—'} />
            <Row label="Joining Date" value={formatDate(employee.joiningDate)} />
            <Row label="Employment Type" value={employee.employmentType} />
            <Row label="Manager" value={employee.managerId ? `${employee.managerId.firstName} ${employee.managerId.lastName}` : '—'} />
            <Row label="Address" value={employee.address || '—'} />
          </dl>
        </Card>

        <Card padded={false} className="p-5">
          <CardHeader title="Recent Tasks" />
          {tasks.length === 0 ? (
            <EmptyState title="No tasks assigned" />
          ) : (
            <div className="space-y-3">
              {tasks.map((t) => (
                <div key={t._id} className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-700 truncate">{t.title}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card padded={false} className="p-5">
        <CardHeader title="Recent Attendance" />
        <Table columns={attendanceColumns} data={attendance} emptyState={<EmptyState title="No attendance records" />} />
      </Card>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800 text-right">{value}</dd>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
