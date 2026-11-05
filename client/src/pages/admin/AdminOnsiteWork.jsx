import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { MapPin, Clock, CheckCircle2, XCircle, Check, X, Eye } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { StatCard } from '../../components/StatCard.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { InfoRow } from '../../components/InfoRow.jsx';
import { formatOnsiteDate } from '../../features/onsiteWork/onsiteFormat.js';
import * as onsiteService from '../../services/onsiteWorkService.js';
import * as employeeService from '../../services/employeeService.js';
import { formatDateTime } from '../../utils/formatters.js';
import { hasPermission } from '../../utils/permissions.js';
import { PERMISSIONS } from '../../utils/constants.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const employeeName = (r) => `${r.employeeId?.firstName || ''} ${r.employeeId?.lastName || ''}`.replace(/\s+/g, ' ').trim() || '—';
const employeeEmail = (r) => r.employeeId?.userId?.email || '—';

/** Admin → Onsite Work Requests. Super Admins and explicitly granted reviewers only (server-enforced). */
export function AdminOnsiteWork() {
  const { user } = useAuth();
  const toast = useToast();
  const allowed = hasPermission(user, PERMISSIONS.ONSITE_WORK_REVIEW);
  const ownEmployeeId = user?.employee?._id;

  const [requests, setRequests] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, summary: null });
  const [filters, setFilters] = useState({ status: 'PENDING', employeeId: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);

  const [viewTarget, setViewTarget] = useState(null);
  const [action, setAction] = useState(null); // { kind: 'approve' | 'reject', request }
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries({ ...filters, page }).filter(([, v]) => v !== '' && v != null));
    onsiteService
      .listOnsite(params)
      .then((res) => {
        setRequests(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [filters, page, toast]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    employeeService
      .listEmployees({ limit: 500 })
      .then((res) => setEmployees(res.data || []))
      .catch(() => {});
  }, [allowed]);

  if (!allowed) return <Navigate to="/not-authorized" replace />;

  const setFilter = (key) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: e.target.value }));
  };

  const canReview = (r) => r.status === 'PENDING' && r.employeeId?._id !== ownEmployeeId;
  const openAction = (kind, request) => {
    setComment('');
    setCommentError('');
    setAction({ kind, request });
  };

  const runAction = async () => {
    const text = comment.trim();
    if (action.kind === 'reject' && text.length < 3) return setCommentError('Please give a reason for the rejection.');
    setSubmitting(true);
    try {
      if (action.kind === 'approve') {
        await onsiteService.approveOnsite(action.request._id, text);
        toast.success('Onsite work request approved.');
      } else {
        await onsiteService.rejectOnsite(action.request._id, text);
        toast.success('Onsite work request rejected.');
      }
      setAction(null);
      setViewTarget(null);
    } catch (err) {
      // e.g. 409: another reviewer acted first — the refreshed list shows the outcome.
      toast.error(getErrorMessage(err));
      setAction(null);
    } finally {
      setSubmitting(false);
      load();
    }
  };

  const columns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{employeeName(r)}</p>
          <p className="text-xs text-slate-400">{employeeEmail(r)}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Date', render: (r) => <span className="font-semibold">{formatOnsiteDate(r.date)}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="max-w-[140px] truncate block" title={r.reason}>{r.reason}</span> },
    { key: 'workLocation', header: 'Work Location', render: (r) => <span className="max-w-[160px] truncate block" title={r.workLocation}>{r.workLocation}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'submittedAt', header: 'Submitted', render: (r) => formatDateTime(r.submittedAt || r.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={Eye} onClick={() => setViewTarget(r)}>
            View
          </Button>
          {canReview(r) && (
            <>
              <Button size="sm" variant="secondary" icon={Check} onClick={() => openAction('approve', r)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" icon={X} onClick={() => openAction('reject', r)}>
                Reject
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const s = meta.summary || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Onsite Work Requests</h2>
        <p className="text-base text-slate-500 mt-1">Approve or reject requests to work outside the assigned office. Approval lets the employee check in from the onsite location on that date only.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Pending" value={s.pending ?? 0} icon={Clock} tone="amber" />
        <StatCard label="Approved" value={s.approved ?? 0} icon={CheckCircle2} tone="green" />
        <StatCard label="Rejected" value={s.rejected ?? 0} icon={XCircle} tone="red" />
      </div>

      <Card padded={false} className="p-5">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <Select id="onsite-filter-status" label="Status" className="sm:w-40" value={filters.status} onChange={setFilter('status')} aria-label="Status">
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
          <Select id="onsite-filter-employee" label="Employee" className="sm:w-56" value={filters.employeeId} onChange={setFilter('employeeId')} aria-label="Employee">
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e._id} value={e._id}>
                {`${e.firstName || ''} ${e.lastName || ''}`.trim()}
              </option>
            ))}
          </Select>
          <Input id="onsite-filter-from" label="From" type="date" className="sm:w-44" value={filters.from} onChange={setFilter('from')} />
          <Input id="onsite-filter-to" label="To" type="date" className="sm:w-44" value={filters.to} onChange={setFilter('to')} />
        </div>
        <Table columns={columns} data={requests} loading={loading} emptyState={<EmptyState icon={MapPin} title="No onsite work requests" />} />
        <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />
      </Card>

      <Modal
        open={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
        title="Onsite Work Request"
        footer={
          viewTarget && canReview(viewTarget) ? (
            <>
              <Button variant="outline" icon={X} onClick={() => openAction('reject', viewTarget)}>
                Reject
              </Button>
              <Button icon={Check} onClick={() => openAction('approve', viewTarget)}>
                Approve
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
          )
        }
      >
        {viewTarget && (
          <div className="space-y-1">
            <InfoRow label="Employee" value={employeeName(viewTarget)} />
            <InfoRow label="Email" value={employeeEmail(viewTarget)} />
            <InfoRow label="Date" value={formatOnsiteDate(viewTarget.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} />
            <InfoRow label="Status" value={<StatusBadge status={viewTarget.status} />} />
            <InfoRow label="Reason" value={viewTarget.reason} />
            <InfoRow label="Work Location" value={viewTarget.workLocation} />
            <InfoRow label="Notes" value={viewTarget.description || '—'} />
            <InfoRow label="Submitted" value={formatDateTime(viewTarget.submittedAt || viewTarget.createdAt)} />
            {viewTarget.reviewedAt && (
              <>
                <InfoRow label="Reviewed By" value={viewTarget.reviewerName || '—'} />
                <InfoRow label="Reviewed On" value={formatDateTime(viewTarget.reviewedAt)} />
                <InfoRow label="Comment" value={viewTarget.reviewComment || '—'} />
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(action)}
        onClose={() => !submitting && setAction(null)}
        title={action?.kind === 'approve' ? 'Approve onsite work?' : 'Reject onsite work?'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAction(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant={action?.kind === 'approve' ? 'primary' : 'danger'} loading={submitting} onClick={runAction}>
              {action?.kind === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        {action && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {action.kind === 'approve'
                ? `${employeeName(action.request)} will be able to check in and out from outside the assigned office on ${formatOnsiteDate(action.request.date)}. GPS is still recorded, and attendance counts only after an actual check-in.`
                : `This rejects the onsite work request from ${employeeName(action.request)} for ${formatOnsiteDate(action.request.date)}.`}
            </p>
            <Textarea
              id="onsite-review-comment"
              label={action.kind === 'approve' ? 'Comment (optional)' : 'Reason for rejection'}
              rows={3}
              maxLength={500}
              value={comment}
              error={commentError}
              onChange={(e) => {
                setComment(e.target.value);
                setCommentError('');
              }}
              required={action.kind === 'reject'}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
