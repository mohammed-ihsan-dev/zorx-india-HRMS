import { useEffect, useState } from 'react';
import { FileEdit, Plus } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Button } from '../../components/Button.jsx';
import { EditRequestModal } from './EditRequestModal.jsx';
import * as editRequestService from '../../services/editRequestService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function EditRequestsTab({ profile }) {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = () => {
    setLoading(true);
    editRequestService
      .getMyEditRequests()
      .then(setRequests)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'field', header: 'Request Type', render: (r) => titleCase(r.field) },
    { key: 'requestedValue', header: 'Requested Change', render: (r) => <span className="max-w-[200px] truncate block">{r.requestedValue}</span> },
    { key: 'createdAt', header: 'Submitted', render: (r) => formatDate(r.createdAt) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'response',
      header: 'HR Response',
      render: (r) => (r.reviewComment ? <span className="max-w-[200px] truncate block">{r.reviewComment}</span> : '—'),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="My Edit Requests"
        subtitle="Track the status of profile change requests you've submitted"
        action={
          <Button size="sm" icon={Plus} onClick={() => setModalOpen(true)}>
            Raise Edit Request
          </Button>
        }
      />
      <Table
        columns={columns}
        data={requests}
        loading={loading}
        emptyState={<EmptyState icon={FileEdit} title="No edit requests submitted" description="Requests you submit to HR will appear here." />}
      />

      <EditRequestModal open={modalOpen} onClose={() => setModalOpen(false)} profile={profile} onSubmitted={load} />
    </Card>
  );
}
