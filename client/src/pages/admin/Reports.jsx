import { useEffect, useState } from 'react';
import { Download, CalendarClock, Users, ListChecks, AlertTriangle, FileBarChart } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Tabs } from '../../components/Tabs.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import * as departmentService from '../../services/departmentService.js';
import {
  getAttendanceReport,
  getLeaveReport,
  getEmployeeReport,
  getTaskReport,
  downloadReportCsv,
} from '../../services/reportService.js';
import { useToast } from '../../hooks/useToast.js';

const REPORT_TABS = [
  { key: 'attendance', label: 'Attendance', icon: CalendarClock },
  { key: 'employees', label: 'Employees', icon: Users },
  { key: 'leave', label: 'Leave', icon: CalendarClock },
  { key: 'tasks', label: 'Tasks', icon: ListChecks },
];

const LEAVE_STATUS_OPTIONS = ['', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const LEAVE_TYPE_OPTIONS = ['', 'CASUAL', 'SICK', 'EARNED', 'UNPAID'];
const EMPLOYEE_STATUS_OPTIONS = ['', 'ACTIVE', 'INACTIVE'];
const TASK_STATUS_OPTIONS = ['', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'];

const REPORT_CONFIG = {
  attendance: { path: '/reports/attendance', fetch: getAttendanceReport, label: 'Attendance Report' },
  employees: { path: '/reports/employees', fetch: getEmployeeReport, label: 'Employee Report' },
  leave: { path: '/reports/leave', fetch: getLeaveReport, label: 'Leave Report' },
  tasks: { path: '/reports/tasks', fetch: getTaskReport, label: 'Task Report' },
};

export function Reports() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('attendance');
  const [departments, setDepartments] = useState([]);

  const [filters, setFilters] = useState({
    attendance: { from: '', to: '', departmentId: '' },
    employees: { from: '', to: '', departmentId: '', status: '' },
    leave: { from: '', to: '', status: '', leaveType: '' },
    tasks: { from: '', to: '', status: '' },
  });

  const [preview, setPreview] = useState({ loading: true, error: '', count: null });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    departmentService.listDepartments().then(setDepartments).catch(() => {});
  }, []);

  const activeFilters = filters[activeTab];

  useEffect(() => {
    let cancelled = false;
    setPreview({ loading: true, error: '', count: null });

    const params = Object.fromEntries(Object.entries(activeFilters).filter(([, v]) => v));
    REPORT_CONFIG[activeTab]
      .fetch(params)
      .then((records) => {
        if (cancelled) return;
        setPreview({ loading: false, error: '', count: records.length });
      })
      .catch(() => {
        if (cancelled) return;
        setPreview({ loading: false, error: 'Could not load report data.', count: null });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, JSON.stringify(activeFilters)]);

  const setFilter = (field) => (e) => {
    const value = e.target.value;
    setFilters((f) => ({ ...f, [activeTab]: { ...f[activeTab], [field]: value } }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = Object.fromEntries(Object.entries(activeFilters).filter(([, v]) => v));
      await downloadReportCsv(REPORT_CONFIG[activeTab].path, params);
      toast.success(`${REPORT_CONFIG[activeTab].label} exported successfully.`);
    } catch (err) {
      toast.error(err?.message || 'Could not export this report.');
    } finally {
      setExporting(false);
    }
  };

  const exportDisabled = exporting || preview.loading || Boolean(preview.error) || preview.count === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Reports</h2>
        <p className="text-base text-slate-500 mt-1">Generate and export real-time data reports for ZORX INDIA.</p>
      </div>

      <Card padded={false} className="p-4 sm:p-5">
        <Tabs tabs={REPORT_TABS} active={activeTab} onChange={setActiveTab} />

        <div className="pt-6">
          <CardHeader title={REPORT_CONFIG[activeTab].label} subtitle="Filters apply directly to the exported data." />

          <div className="flex flex-wrap items-end gap-4">
            {activeTab === 'attendance' && (
              <>
                <Input label="Start Date" type="date" className="w-44" value={filters.attendance.from} onChange={setFilter('from')} />
                <Input label="End Date" type="date" className="w-44" value={filters.attendance.to} onChange={setFilter('to')} />
                <Select label="Department" className="w-52" value={filters.attendance.departmentId} onChange={setFilter('departmentId')}>
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </>
            )}

            {activeTab === 'employees' && (
              <>
                <Select label="Department" className="w-52" value={filters.employees.departmentId} onChange={setFilter('departmentId')}>
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
                <Select label="Status" className="w-40" value={filters.employees.status} onChange={setFilter('status')}>
                  {EMPLOYEE_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s || 'All Statuses'}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Joined From"
                  type="date"
                  className="w-44"
                  value={filters.employees.from}
                  onChange={setFilter('from')}
                  hint="Optional — filters by joining date"
                />
                <Input label="Joined To" type="date" className="w-44" value={filters.employees.to} onChange={setFilter('to')} />
              </>
            )}

            {activeTab === 'leave' && (
              <>
                <Input label="Start Date" type="date" className="w-44" value={filters.leave.from} onChange={setFilter('from')} />
                <Input label="End Date" type="date" className="w-44" value={filters.leave.to} onChange={setFilter('to')} />
                <Select label="Status" className="w-40" value={filters.leave.status} onChange={setFilter('status')}>
                  {LEAVE_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s || 'All Statuses'}
                    </option>
                  ))}
                </Select>
                <Select label="Leave Type" className="w-40" value={filters.leave.leaveType} onChange={setFilter('leaveType')}>
                  {LEAVE_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t || 'All Types'}
                    </option>
                  ))}
                </Select>
              </>
            )}

            {activeTab === 'tasks' && (
              <>
                <Select label="Status" className="w-44" value={filters.tasks.status} onChange={setFilter('status')}>
                  {TASK_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s ? s.replace('_', ' ') : 'All Statuses'}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Due From"
                  type="date"
                  className="w-44"
                  value={filters.tasks.from}
                  onChange={setFilter('from')}
                  hint="Optional — filters by due date"
                />
                <Input label="Due To" type="date" className="w-44" value={filters.tasks.to} onChange={setFilter('to')} />
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-5 border-t border-slate-100">
            <div className="text-sm font-semibold text-slate-600">
              {preview.loading ? (
                <span className="text-slate-400">Loading records…</span>
              ) : preview.error ? (
                <span className="inline-flex items-center gap-1.5 text-red-600">
                  <AlertTriangle size={15} /> {preview.error}
                </span>
              ) : (
                <span>
                  Records Found: <span className="text-slate-900 font-extrabold">{preview.count}</span>
                </span>
              )}
            </div>

            <Button icon={Download} loading={exporting} disabled={exportDisabled} onClick={handleExport}>
              Export CSV
            </Button>
          </div>

          {!preview.loading && !preview.error && preview.count === 0 && (
            <EmptyState
              icon={FileBarChart}
              title="No records match these filters"
              description="Try widening the date range or clearing a filter."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
