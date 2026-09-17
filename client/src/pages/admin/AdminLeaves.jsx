import { useEffect, useState } from 'react';
import { CalendarClock, Check, X } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import * as leaveService from '../../services/leaveService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { useAuth } from '../../hooks/useAuth.js';
import { BACK_OFFICE_ROLES } from '../../utils/constants.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function AdminLeaves() {
  const toast = useToast();
  const { user } = useAuth();
  const canReview = BACK_OFFICE_ROLES.includes(user?.role);

  const [leaves, setLeaves] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState(null); // { leave, action }
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    leaveService
      .listLeaves({ status: status || undefined, page })
      .then((res) => {
        setLeaves(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async () => {
    setSubmitting(true);
    try {
      if (actionTarget.action === 'approve') {
        await leaveService.approveLeave(actionTarget.leave._id);
        toast.success('Leave approved.');
      } else {
        await leaveService.rejectLeave(actionTarget.leave._id);
        toast.success('Leave rejected.');
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
    { key: 'leaveType', header: 'Type', render: (r) => titleCase(r.leaveType) },
    { key: 'startDate', header: 'Start', render: (r) => formatDate(r.startDate) },
    { key: 'endDate', header: 'End', render: (r) => formatDate(r.endDate) },
    { key: 'days', header: 'Days' },
    { key: 'reason', header: 'Reason', render: (r) => <span className="max-w-[200px] truncate block">{r.reason}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    ...(canReview
      ? [
          {
            key: 'actions',
            header: '',
            render: (r) =>
              r.status === 'PENDING' ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" icon={Check} onClick={() => setActionTarget({ leave: r, action: 'approve' })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" icon={X} onClick={() => setActionTarget({ leave: r, action: 'reject' })}>
                    Reject
                  </Button>
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Card padded={false} className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Leave Requests</h3>
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
      <Table columns={columns} data={leaves} loading={loading} emptyState={<EmptyState icon={CalendarClock} title="No leave requests" />} />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />

      <ConfirmDialog
        open={Boolean(actionTarget)}
        onClose={() => setActionTarget(null)}
        onConfirm={handleAction}
        loading={submitting}
        title={actionTarget?.action === 'approve' ? 'Approve leave request?' : 'Reject leave request?'}
        description={`This will ${actionTarget?.action} the leave request for ${actionTarget?.leave.employeeId?.firstName} ${actionTarget?.leave.employeeId?.lastName}.`}
        confirmLabel={actionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
        variant={actionTarget?.action === 'approve' ? 'primary' : 'danger'}
      />
    </Card>
  );
}
