import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { MapPin, Plus, Pencil, X } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { Table } from '../../components/Table.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { OnsiteRequestModal } from '../../features/onsiteWork/OnsiteRequestModal.jsx';
import { formatOnsiteDate, onsiteDateInputValue } from '../../features/onsiteWork/onsiteFormat.js';
import * as onsiteService from '../../services/onsiteWorkService.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { getTodayDateInputValue } from '../../utils/calendarDate.js';

function Truncated({ value }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <span className="max-w-[220px] truncate block" title={value}>
      {value}
    </span>
  );
}

/** Onsite Work Requests — only for the configured employee (server-enforced). */
export function OnsiteWork() {
  const { user } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, editing: null });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const eligible = Boolean(user?.onsiteWorkEligible);
  const todayYMD = getTodayDateInputValue();

  const load = useCallback(() => {
    setLoading(true);
    onsiteService
      .getMyOnsite()
      .then(setRequests)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    if (eligible) load();
  }, [eligible, load]);

  if (!eligible) return <Navigate to="/" replace />;

  const editable = (r) => r.status === 'PENDING' && onsiteDateInputValue(r.date) >= todayYMD;

  const confirmCancel = async () => {
    setCancelling(true);
    try {
      await onsiteService.cancelMyOnsite(cancelTarget._id);
      toast.success('Onsite work request cancelled.');
      setCancelTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  const columns = [
    { key: 'date', header: 'Date', render: (r) => <span className="font-semibold text-slate-800">{formatOnsiteDate(r.date)}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'reason', header: 'Reason', render: (r) => <Truncated value={r.reason} /> },
    { key: 'workLocation', header: 'Work Location', render: (r) => <Truncated value={r.workLocation} /> },
    { key: 'reviewComment', header: 'Review Comment', render: (r) => <Truncated value={r.reviewComment} /> },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        editable(r) ? (
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setModal({ open: true, editing: r })}>
              Edit
            </Button>
            <Button size="sm" variant="outline" icon={X} onClick={() => setCancelTarget(r)}>
              Cancel
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Onsite Work</h2>
          <p className="text-base text-slate-500 mt-1">Request approval to work outside your office, e.g. for a shoot with the videographer.</p>
        </div>
        <Button icon={Plus} onClick={() => setModal({ open: true, editing: null })} className="self-start sm:self-auto">
          Request Onsite Work
        </Button>
      </div>

      <Card padded={false} className="p-5">
        <h3 className="font-semibold text-slate-900 mb-4">My Onsite Work Requests</h3>
        <Table
          columns={columns}
          data={requests}
          loading={loading}
          emptyState={<EmptyState icon={MapPin} title="No onsite work requests yet" description="Requests you submit will appear here with their status." />}
        />
      </Card>

      <OnsiteRequestModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => !cancelling && setCancelTarget(null)}
        onConfirm={confirmCancel}
        loading={cancelling}
        title="Cancel this request?"
        description={cancelTarget ? `Your onsite work request for ${formatOnsiteDate(cancelTarget.date)} will be cancelled.` : ''}
        confirmLabel="Cancel Request"
        variant="danger"
      />
    </div>
  );
}
