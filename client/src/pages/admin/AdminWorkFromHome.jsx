import { useCallback, useEffect, useState } from 'react';
import { House, Clock, CheckCircle2, XCircle, Check, X, Eye } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { StatCard } from '../../components/StatCard.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Select, Textarea } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { InfoRow } from '../../components/InfoRow.jsx';
import { formatWfhDate } from '../../features/workFromHome/wfhFormat.js';
import * as wfhService from '../../services/wfhService.js';
import { formatDate, formatDateTime } from '../../utils/formatters.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const employeeName = (r) => `${r.employeeId?.firstName || ''} ${r.employeeId?.lastName || ''}`.trim() || '—';

export function AdminWorkFromHome() {
  const toast = useToast();
  const { user } = useAuth();
  const ownEmployeeId = user?.employee?._id;

  const [requests, setRequests] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [viewTarget, setViewTarget] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([wfhService.listWfh({ status: status || undefined, page }), wfhService.getWfhSummary()])
      .then(([listRes, summaryData]) => {
        setRequests(listRes.data);
        setMeta(listRes.meta);
        setSummary(summaryData);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [status, page, toast]);

  useEffect(load, [load]);

  const runReview = async (action) => {
    setSubmitting(true);
    try {
      if (action === 'approve') {
        await wfhService.approveWfh(approveTarget._id);
        toast.success('WFH request approved.');
        setApproveTarget(null);
      } else {
        await wfhService.rejectWfh(rejectTarget._id, rejectNote.trim());
        toast.success('WFH request rejected.');
        setRejectTarget(null);
      }
      setViewTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openReject = (r) => {
    setRejectNote('');
    setRejectTarget(r);
  };

  const canReview = (r) => r.status === 'PENDING' && r.employeeId?._id !== ownEmployeeId;

  const columns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{employeeName(r)}</p>
          <p className="text-xs text-slate-400">{r.employeeId?.employeeCode}</p>
        </div>
      ),
    },
    { key: 'date', header: 'WFH Date', render: (r) => formatWfhDate(r.date) },
    { key: 'reason', header: 'Reason', render: (r) => <span className="max-w-[120px] truncate block" title={r.reason}>{r.reason}</span> },
    { key: 'workPlan', header: 'Work Plan', render: (r) => <span className="max-w-[130px] truncate block" title={r.workPlan}>{r.workPlan}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'createdAt', header: 'Requested On', render: (r) => formatDate(r.createdAt) },
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
              <Button size="sm" variant="secondary" icon={Check} onClick={() => setApproveTarget(r)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" icon={X} onClick={() => openReject(r)}>
                Reject
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Work From Home</h2>
        <p className="text-base text-slate-500 mt-1">Review and manage employee WFH requests.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Pending Requests" value={summary?.pending ?? 0} icon={Clock} tone="amber" />
        <StatCard label="Approved Requests" value={summary?.approved ?? 0} icon={CheckCircle2} tone="green" />
        <StatCard label="Rejected Requests" value={summary?.rejected ?? 0} icon={XCircle} tone="red" />
        <StatCard label="Today's WFH" value={summary?.today ?? 0} icon={House} tone="blue" />
      </div>

      <Card padded={false} className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="font-semibold text-slate-900">WFH Requests</h3>
          <Select
            className="sm:w-44"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
        <Table columns={columns} data={requests} loading={loading} emptyState={<EmptyState icon={House} title="No WFH requests" />} />
        <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />
      </Card>

      <Modal
        open={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
        title="WFH Request Details"
        footer={
          viewTarget && canReview(viewTarget) ? (
            <>
              <Button variant="outline" icon={X} onClick={() => openReject(viewTarget)}>
                Reject
              </Button>
              <Button icon={Check} onClick={() => setApproveTarget(viewTarget)}>
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
            <InfoRow label="Employee" value={`${employeeName(viewTarget)} (${viewTarget.employeeId?.employeeCode || '—'})`} />
            <InfoRow label="WFH Date" value={formatWfhDate(viewTarget.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} />
            <InfoRow label="Status" value={<StatusBadge status={viewTarget.status} />} />
            <InfoRow label="Reason" value={viewTarget.reason} />
            <InfoRow label="Work Plan" value={viewTarget.workPlan} />
            <InfoRow label="Additional Remark" value={viewTarget.remark || '—'} />
            <InfoRow label="Requested On" value={formatDateTime(viewTarget.createdAt)} />
            {viewTarget.reviewedAt && (
              <>
                <InfoRow label="Reviewed By" value={viewTarget.reviewedBy?.email || '—'} />
                <InfoRow label="Reviewed On" value={formatDateTime(viewTarget.reviewedAt)} />
                <InfoRow label="Review Note" value={viewTarget.reviewNote || '—'} />
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(approveTarget)}
        onClose={() => !submitting && setApproveTarget(null)}
        onConfirm={() => runReview('approve')}
        loading={submitting}
        title="Approve WFH request?"
        description={approveTarget ? `${employeeName(approveTarget)} will be able to check in from outside the office on ${formatWfhDate(approveTarget.date)}.` : ''}
        confirmLabel="Approve"
        variant="primary"
      />

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => !submitting && setRejectTarget(null)}
        title="Reject WFH request?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="danger" loading={submitting} onClick={() => runReview('reject')}>
              Reject
            </Button>
          </>
        }
      >
        {rejectTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This will reject the WFH request from {employeeName(rejectTarget)} for {formatWfhDate(rejectTarget.date)}.
            </p>
            <Textarea
              label="Review Note (optional)"
              rows={3}
              maxLength={500}
              placeholder="Please coordinate with the team before taking WFH."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
