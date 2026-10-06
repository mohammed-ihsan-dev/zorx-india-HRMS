import { useCallback, useEffect, useState } from 'react';
import { House, Plus } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { Table } from '../../components/Table.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { WfhRequestModal } from '../../features/workFromHome/WfhRequestModal.jsx';
import { formatWfhDate } from '../../features/workFromHome/wfhFormat.js';
import * as wfhService from '../../services/wfhService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

function TruncatedText({ value }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <span className="max-w-[220px] truncate block" title={value}>
      {value}
    </span>
  );
}

export function WorkFromHome() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  // null until known, so the Request button never flashes for a permanent-WFH employee.
  const [defaultWfh, setDefaultWfh] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([wfhService.getMyWfh(), wfhService.getMyWfhToday()])
      .then(([mine, today]) => {
        setRequests(mine);
        setDefaultWfh(Boolean(today?.defaultWfh));
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(load, [load]);

  const columns = [
    { key: 'date', header: 'Date', render: (r) => formatWfhDate(r.date) },
    { key: 'reason', header: 'Reason', render: (r) => <TruncatedText value={r.reason} /> },
    { key: 'workPlan', header: 'Work Plan', render: (r) => <TruncatedText value={r.workPlan} /> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'reviewNote', header: 'Review Note', render: (r) => <TruncatedText value={r.reviewNote} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Work From Home</h2>
          <p className="text-base text-slate-500 mt-1">Request approval to work remotely.</p>
        </div>
        {defaultWfh === false && (
          <Button icon={Plus} onClick={() => setModalOpen(true)} className="self-start sm:self-auto">
            Request WFH
          </Button>
        )}
      </div>

      {defaultWfh && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sky-900">
          <House size={22} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Work From Home</p>
            <p className="text-sm mt-0.5">You are configured as a permanent Work From Home employee.</p>
            <p className="text-sm">WFH approval is not required for you.</p>
          </div>
        </div>
      )}

      {!(defaultWfh && requests.length === 0) && (
        <Card padded={false} className="p-5">
          <h3 className="font-semibold text-slate-900 mb-4">My WFH Requests</h3>
          <Table
            columns={columns}
            data={requests}
            loading={loading}
            emptyState={
              <EmptyState icon={House} title="No WFH requests yet" description="Requests you submit will appear here with their status." />
            }
          />
        </Card>
      )}

      <WfhRequestModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmitted={load} />
    </div>
  );
}
