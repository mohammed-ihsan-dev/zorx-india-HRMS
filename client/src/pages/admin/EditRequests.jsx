import { useEffect, useState } from 'react';
import { FileEdit, Check, X } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Select, Textarea } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import * as editRequestService from '../../services/editRequestService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function EditRequests() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState(null); // { request, action }
  const [reviewComment, setReviewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    editRequestService
      .listEditRequests({ status: status || undefined, page })
      .then((res) => {
        setRequests(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAction = (request, action) => {
    setActionTarget({ request, action });
    setReviewComment('');
  };

  const handleSubmitAction = async () => {
    setSubmitting(true);
    try {
      if (actionTarget.action === 'approve') {
        await editRequestService.approveEditRequest(actionTarget.request._id, reviewComment);
        toast.success('Edit request approved and applied.');
      } else {
        await editRequestService.rejectEditRequest(actionTarget.request._id, reviewComment);
        toast.success('Edit request rejected.');
      }
      setActionTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

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
    { key: 'field', header: 'Request Type', render: (r) => titleCase(r.field) },
    { key: 'currentValue', header: 'Current Value', render: (r) => <span className="max-w-[160px] truncate block">{r.currentValue || '—'}</span> },
    { key: 'requestedValue', header: 'Requested Value', render: (r) => <span className="max-w-[160px] truncate block">{r.requestedValue}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="max-w-[180px] truncate block">{r.reason}</span> },
    { key: 'createdAt', header: 'Submitted', render: (r) => formatDate(r.createdAt) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        r.status === 'PENDING' ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon={Check} onClick={() => openAction(r, 'approve')}>
              Approve
            </Button>
            <Button size="sm" variant="outline" icon={X} onClick={() => openAction(r, 'reject')}>
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <Card padded={false} className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Edit Requests</h3>
        <Select
          className="w-44"
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
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>
      <Table columns={columns} data={requests} loading={loading} emptyState={<EmptyState icon={FileEdit} title="No edit requests" />} />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />

      <Modal
        open={Boolean(actionTarget)}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.action === 'approve' ? 'Approve edit request?' : 'Reject edit request?'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setActionTarget(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant={actionTarget?.action === 'approve' ? 'primary' : 'danger'}
              onClick={handleSubmitAction}
              loading={submitting}
            >
              {actionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-4">
          {actionTarget?.action === 'approve'
            ? `This will update ${actionTarget?.request.employeeId?.firstName}'s ${titleCase(actionTarget?.request.field || '')} where possible and notify them.`
            : `This will reject ${actionTarget?.request.employeeId?.firstName}'s request and notify them.`}
        </p>
        <Textarea
          label={actionTarget?.action === 'approve' ? 'Comment (optional)' : 'Rejection Reason'}
          rows={3}
          value={reviewComment}
          onChange={(e) => setReviewComment(e.target.value)}
        />
      </Modal>
    </Card>
  );
}
