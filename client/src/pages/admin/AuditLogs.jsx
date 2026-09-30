import { useEffect, useState } from 'react';
import { ShieldCheck, RotateCcw, AlertCircle } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import * as auditLogService from '../../services/auditLogService.js';
import { formatDateTime, titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function AuditLogs() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLogs = (p) => {
    setLoading(true);
    setError(null);
    auditLogService
      .listAuditLogs({ page: p, limit: 10 })
      .then((res) => {
        setLogs(res.data || []);
        setMeta(res.meta || { page: p, pages: 1, total: 0, limit: 10 });
      })
      .catch((err) => {
        const msg = getErrorMessage(err, 'Unable to load audit logs.');
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  const columns = [
    {
      key: 'action',
      header: 'Action',
      render: (r) => <span className="font-bold text-slate-900">{titleCase(r.action)}</span>,
    },
    { key: 'description', header: 'Description', render: (r) => <span className="text-slate-700">{r.description}</span> },
    { key: 'actor', header: 'Performed By', render: (r) => <span className="font-semibold text-slate-800">{r.actorId?.email || 'System'}</span> },
    { key: 'createdAt', header: 'Timestamp', render: (r) => <span className="text-slate-500 font-medium">{formatDateTime(r.createdAt)}</span> },
  ];

  if (error && logs.length === 0) {
    return (
      <Card padded={false} className="p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Unable to load audit logs</h3>
        <p className="text-sm text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => fetchLogs(page)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-800 text-white font-bold text-sm hover:bg-brand-900 transition-colors shadow-xs"
        >
          <RotateCcw size={16} />
          Retry
        </button>
      </Card>
    );
  }

  return (
    <Card padded={false} className="p-5 sm:p-6 border border-slate-200/90 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Audit Logs</h3>
          <p className="text-xs text-slate-500 mt-0.5">System activity, modifications, and administrative events</p>
        </div>
      </div>

      <Table
        columns={columns}
        data={logs}
        loading={loading}
        emptyState={
          <EmptyState
            icon={ShieldCheck}
            title="No audit logs found"
            description="System events and administrative actions will appear here."
          />
        }
      />

      <Pagination
        page={meta.page || page}
        pages={meta.pages || Math.ceil((meta.total || 0) / 10) || 1}
        total={meta.total || 0}
        limit={10}
        itemLabel="logs"
        onPageChange={(newPage) => setPage(newPage)}
      />
    </Card>
  );
}
