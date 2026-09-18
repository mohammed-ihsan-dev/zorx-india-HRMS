import { useEffect, useState } from 'react';
import { Plus, Search, Users, Power, ExternalLink, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { CardSkeleton } from '../../components/Skeleton.jsx';
import { CreateEmployeeModal } from '../../features/employees/CreateEmployeeModal.jsx';
import * as employeeService from '../../services/employeeService.js';
import * as departmentService from '../../services/departmentService.js';
import { formatDate, initials, isNotProvided } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

// Large card-header photo tile — visually distinct from the small circular
// Avatar used elsewhere, but needs the same broken-image fallback behavior.
function EmployeePhotoTile({ src, firstName, lastName }) {
  const [failed, setFailed] = useState(false);

  return src && !failed ? (
    <img
      src={src}
      alt={`${firstName} ${lastName}`}
      onError={() => setFailed(true)}
      className={`w-full h-full object-cover transition-transform duration-300 ${
        src.includes('ajmal') ? 'scale-125 object-[center_20%]' : ''
      }`}
    />
  ) : (
    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-brand-100/90 border border-brand-200/80 text-brand-950 flex items-center justify-center text-3xl sm:text-4xl font-black shadow-xs">
      {initials(firstName, lastName)}
    </div>
  );
}

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
  const [accountAction, setAccountAction] = useState(null); // { employee, action: 'approve' | 'reject' }
  const [authStatus, setAuthStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    departmentService.listDepartments().then(setDepartments).catch(() => {});
  }, []);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = () => {
    setLoading(true);
    employeeService
      .listEmployees({
        search: debouncedSearch || undefined,
        departmentId: departmentId || undefined,
        status: status || undefined,
        authStatus: authStatus || undefined,
        page,
        limit: 8,
      })
      .then((res) => {
        setEmployees(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [debouncedSearch, departmentId, status, authStatus, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccountAction = async () => {
    setSubmitting(true);
    try {
      if (accountAction.action === 'approve') {
        await employeeService.approveUserAccount(accountAction.employee._id);
        toast.success('Account approved. The employee can now log in.');
      } else {
        await employeeService.rejectUserAccount(accountAction.employee._id);
        toast.success('Account rejected.');
      }
      setAccountAction(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <div className="space-y-8 pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm">
        <div>
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-brand-700 bg-brand-50 px-3 py-1 rounded-md border border-brand-200/60">
            Workforce Management
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-2.5">
            Employee Directory
          </h2>
          <p className="text-base text-slate-500 mt-1">Manage staff profiles, departments, and active statuses across ZORX INDIA.</p>
        </div>
        <Button size="lg" icon={Plus} onClick={() => setCreateOpen(true)} className="self-start sm:self-auto font-bold shadow-md">
          Add Employee
        </Button>
      </div>

      {/* Search & Filters Bar */}
      <Card className="rounded-3xl border border-slate-200/90 shadow-sm p-6 bg-white">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search by name, employee code, designation…"
              className="pl-10"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
          <Select
            className="w-full md:w-56"
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
            className="w-full md:w-44"
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
          <Select
            className="w-full md:w-48"
            value={authStatus}
            onChange={(e) => {
              setPage(1);
              setAuthStatus(e.target.value);
            }}
          >
            <option value="">All Accounts</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="REJECTED">Rejected</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </div>
      </Card>

      {/* Employee Cards Grid (4 Cards Per Row on Desktop) */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <Card className="rounded-3xl border border-slate-200/90 p-12 text-center">
          <EmptyState
            icon={Users}
            title="No employees found"
            description="Try adjusting your search or filters to find staff members."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {employees.map((emp) => (
              <div
                key={emp._id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  {/* Profile Picture Header */}
                  <div className="relative w-full aspect-square bg-slate-100 flex flex-col items-center justify-center overflow-hidden border-b border-slate-100">
                    <EmployeePhotoTile src={emp.profileImage || emp.avatarUrl} firstName={emp.firstName} lastName={emp.lastName} />
                    <div className="absolute top-3.5 right-3.5 z-10">
                      {emp.userId?.status && emp.userId.status !== 'ACTIVE' ? (
                        <Badge color={emp.userId.status === 'PENDING_APPROVAL' ? 'amber' : 'red'}>
                          {emp.userId.status.replace('_', ' ')}
                        </Badge>
                      ) : (
                        <Badge color={emp.status === 'ACTIVE' ? 'green' : 'slate'}>{emp.status}</Badge>
                      )}
                    </div>
                  </div>

                  {/* Employee Info Block */}
                  <div className="p-5 space-y-3">
                    <div>
                      <Link to={`/admin/employees/${emp._id}`}>
                        <h4 className="text-lg sm:text-xl font-extrabold text-slate-900 group-hover:text-brand-800 transition-colors leading-snug">
                          {emp.firstName} {emp.lastName}
                        </h4>
                      </Link>
                      <p className="text-sm font-semibold text-brand-800 mt-0.5">
                        {isNotProvided(emp.designation) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200/80">
                            Not Provided
                          </span>
                        ) : (
                          emp.designation
                        )}
                      </p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 font-medium">Employee ID:</span>
                        <span className="font-mono font-bold text-slate-800 truncate text-right">
                          {isNotProvided(emp.employeeCode) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200/80">
                              Not Provided
                            </span>
                          ) : (
                            emp.employeeCode
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 font-medium">Department:</span>
                        <span className="font-semibold text-slate-800 truncate text-right">
                          {isNotProvided(emp.departmentId?.name) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200/80">
                              Not Provided
                            </span>
                          ) : (
                            emp.departmentId?.name
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 font-medium">Joined:</span>
                        <span className="font-medium text-slate-700">{formatDate(emp.joiningDate)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Existing Card Actions Footer */}
                <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    to={`/admin/employees/${emp._id}`}
                    className="text-xs font-extrabold text-brand-800 hover:text-brand-950 hover:underline inline-flex items-center gap-1"
                  >
                    View Details <ExternalLink size={12} />
                  </Link>

                  {emp.userId?.status === 'PENDING_APPROVAL' ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-xs font-extrabold text-emerald-700 hover:text-emerald-900 hover:underline inline-flex items-center gap-1"
                        onClick={() => setAccountAction({ employee: emp, action: 'approve' })}
                      >
                        <Check size={13} /> Approve
                      </button>
                      <button
                        type="button"
                        className="text-xs font-extrabold text-rose-600 hover:text-rose-800 hover:underline inline-flex items-center gap-1"
                        onClick={() => setAccountAction({ employee: emp, action: 'reject' })}
                      >
                        <X size={13} /> Reject
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`text-xs font-extrabold transition-all ${
                        emp.status === 'ACTIVE'
                          ? 'text-rose-600 hover:text-rose-800 hover:underline'
                          : 'text-emerald-700 hover:text-emerald-900 hover:underline'
                      }`}
                      onClick={() => setStatusTarget(emp)}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Power size={13} /> {emp.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination (Only rendered when > 8 employees exist) */}
          {meta.total > 8 && (
            <div className="mt-8 flex justify-center">
              <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Modals & Dialogs */}
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

      <ConfirmDialog
        open={Boolean(accountAction)}
        onClose={() => setAccountAction(null)}
        onConfirm={handleAccountAction}
        loading={submitting}
        title={accountAction?.action === 'approve' ? 'Approve this account?' : 'Reject this account?'}
        description={
          accountAction?.action === 'approve'
            ? `${accountAction?.employee.firstName} ${accountAction?.employee.lastName} will be able to log in immediately.`
            : `${accountAction?.employee.firstName} ${accountAction?.employee.lastName} will not be able to log in.`
        }
        confirmLabel={accountAction?.action === 'approve' ? 'Approve' : 'Reject'}
        variant={accountAction?.action === 'approve' ? 'primary' : 'danger'}
      />
    </div>
  );
}
