import { useEffect, useState } from 'react';
import { Plus, Search, Users, Power } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { CreateEmployeeModal } from '../../features/employees/CreateEmployeeModal.jsx';
import * as employeeService from '../../services/employeeService.js';
import * as departmentService from '../../services/departmentService.js';
import { formatDate, initials } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function Employees() {
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    departmentService.listDepartments().then(setDepartments).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    employeeService
      .listEmployees({ search: search || undefined, departmentId: departmentId || undefined, status: status || undefined, page })
      .then((res) => {
        setEmployees(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, departmentId, status, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleStatus = async () => {
    setSubmitting(true);
    try {
      const nextStatus = statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await employeeService.updateEmployeeStatus(statusTarget._id, nextStatus);
      toast.success(`Employee ${nextStatus === 'ACTIVE' ? 'reactivated' : 'deactivated'}.`);
      setStatusTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Employee',
      render: (r) => (
        <Link to={`/admin/employees/${r._id}`} className="flex items-center gap-3 hover:underline">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-xs font-bold shrink-0">
            {initials(r.firstName, r.lastName)}
          </div>
          <div>
            <p className="font-medium text-slate-800">
              {r.firstName} {r.lastName}
            </p>
            <p className="text-xs text-slate-400">{r.employeeCode}</p>
          </div>
        </Link>
      ),
    },
    { key: 'department', header: 'Department', render: (r) => r.departmentId?.name || '—' },
    { key: 'designation', header: 'Designation', render: (r) => r.designation || '—' },
    { key: 'joiningDate', header: 'Joining Date', render: (r) => formatDate(r.joiningDate) },
    { key: 'status', header: 'Status', render: (r) => <Badge color={r.status === 'ACTIVE' ? 'green' : 'slate'}>{r.status}</Badge> },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <button
          className={`text-xs font-medium hover:underline ${r.status === 'ACTIVE' ? 'text-red-600' : 'text-brand-700'}`}
          onClick={() => setStatusTarget(r)}
        >
          <span className="inline-flex items-center gap-1">
            <Power size={12} /> {r.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
          </span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card padded={false} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold text-slate-900">Employees</h3>
          <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
            Add Employee
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name, code, designation…"
              className="pl-9"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
          <Select
            className="w-48"
            value={departmentId}
            onChange={(e) => {
              setPage(1);
              setDepartmentId(e.target.value);
            }}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-40"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>

        <Table
          columns={columns}
          data={employees}
          loading={loading}
          emptyState={<EmptyState icon={Users} title="No employees found" description="Try adjusting your search or filters." />}
        />
        <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />
      </Card>

      <CreateEmployeeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        departments={departments}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleToggleStatus}
        loading={submitting}
        title={statusTarget?.status === 'ACTIVE' ? 'Deactivate employee?' : 'Reactivate employee?'}
        description={
          statusTarget?.status === 'ACTIVE'
            ? `${statusTarget?.firstName} ${statusTarget?.lastName} will no longer be able to log in or use the system.`
            : `${statusTarget?.firstName} ${statusTarget?.lastName} will regain access to the system.`
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        variant={statusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
      />
    </div>
  );
}
