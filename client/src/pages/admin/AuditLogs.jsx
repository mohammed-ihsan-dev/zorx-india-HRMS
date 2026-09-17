import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    auditLogService
      .listAuditLogs({ page })
      .then((res) => {
        setLogs(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [page, toast]);

  const columns = [
    { key: 'action', header: 'Action', render: (r) => titleCase(r.action) },
    { key: 'description', header: 'Description' },
    { key: 'actor', header: 'Performed By', render: (r) => r.actorId?.email || 'System' },
    { key: 'createdAt', header: 'Timestamp', render: (r) => formatDateTime(r.createdAt) },
  ];

  return (
    <Card padded={false} className="p-5">
      <h3 className="font-semibold text-slate-900 mb-4">Audit Logs</h3>
      <Table columns={columns} data={logs} loading={loading} emptyState={<EmptyState icon={ShieldCheck} title="No audit logs yet" />} />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />
    </Card>
  );
}
