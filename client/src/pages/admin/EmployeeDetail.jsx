import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Loader } from '../../components/Loader.jsx';
import { Table } from '../../components/Table.jsx';
import { StatusBadge, PriorityBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { EditEmployeeModal } from '../../features/employees/EditEmployeeModal.jsx';
import * as employeeService from '../../services/employeeService.js';
import * as departmentService from '../../services/departmentService.js';
import * as attendanceService from '../../services/attendanceService.js';
import * as taskService from '../../services/taskService.js';
import { formatDate, formatTime, formatMinutes, titleCase, isNotProvided } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function EmployeeDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [employee, setEmployee] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    departmentService.listDepartments().then(setDepartments).catch(() => {});

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
      <div className="flex items-center justify-between">
        <Link to="/admin/employees" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-medium">
          <ArrowLeft size={15} /> Back to Employees
        </Link>
        <Button icon={Pencil} size="sm" onClick={() => setEditModalOpen(true)}>
          Edit Profile
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            src={employee.profileImage || employee.avatarUrl}
            firstName={employee.firstName}
            lastName={employee.lastName}
            size="w-16 h-16"
            shape="square"
            textSize="text-2xl"
            className="border-2 border-slate-200/90 shadow-sm"
          />
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl font-extrabold text-slate-900">
              {employee.firstName} {employee.lastName}
            </h2>
            <p className="text-sm font-semibold text-brand-800 mt-0.5">
              {employee.designation || 'No designation'} · {employee.userId?.email || ''} · Code: {isNotProvided(employee.employeeCode) ? 'Not Provided' : employee.employeeCode} · {employee.departmentId?.name || 'Unassigned'}
            </p>
            <Badge color={employee.status === 'ACTIVE' ? 'green' : 'slate'} className="mt-1.5">
              {employee.status}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <MiniStat label="Present" value={stats?.presentCount || 0} />
            <MiniStat label="Late" value={stats?.lateCount || 0} />
            <MiniStat label="Leave" value={stats?.leaveCount || 0} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded={false} className="p-5">
          <CardHeader title="Work & Personal Information" />
          <dl className="space-y-3 text-sm">
            <Row label="Full Name" value={`${employee.firstName} ${employee.lastName}`} />
            <Row label="Email Address" value={employee.userId?.email || '—'} />
            <Row label="Designation" value={employee.designation || '—'} />
            <Row label="Department" value={employee.departmentId?.name || '—'} />
            <Row label="Phone" value={employee.phone || '—'} />
            <Row label="Date of Birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : '—'} />
            <Row label="Joining Date" value={formatDate(employee.joiningDate)} />
            <Row label="Employment Type" value={employee.employmentType ? titleCase(employee.employmentType) : '—'} />
            <Row label="Manager" value={employee.managerId ? `${employee.managerId.firstName} ${employee.managerId.lastName}` : '—'} />
            <Row label="Address" value={employee.address || '—'} />
            <Row
              label="Emergency Contact"
              value={
                employee.emergencyContact?.name
                  ? `${employee.emergencyContact.name} (${employee.emergencyContact.phone || ''}) - ${employee.emergencyContact.relation || ''}`
                  : '—'
              }
            />
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
                  <p className="text-sm font-semibold text-slate-800 truncate">{t.title}</p>
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

      <EditEmployeeModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        employee={employee}
        departments={departments}
        onUpdated={(updated) => {
          setEmployee(updated);
        }}
      />
    </div>
  );
}

function Row({ label, value }) {
  const missing = isNotProvided(value);
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="text-slate-500 font-medium">{label}</dt>
      <dd className="font-semibold text-slate-800 text-right">
        {missing ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200/80">
            Not Provided
          </span>
        ) : (
          value
        )}
      </dd>
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
