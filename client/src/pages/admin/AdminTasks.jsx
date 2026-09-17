import { useEffect, useState } from 'react';
import { Plus, ListChecks } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { StatusBadge, PriorityBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { CreateTaskModal } from '../../features/tasks/CreateTaskModal.jsx';
import * as taskService from '../../services/taskService.js';
import * as employeeService from '../../services/employeeService.js';
import { formatDate } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function AdminTasks() {
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ assignedTo: '', status: '', priority: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    employeeService.listEmployees({ limit: 200 }).then((res) => setEmployees(res.data)).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    taskService
      .listTasks({
        assignedTo: filters.assignedTo || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        page,
      })
      .then((res) => {
        setTasks(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'title', header: 'Task', render: (r) => <span className="font-medium text-slate-800">{r.title}</span> },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      render: (r) => `${r.assignedTo?.firstName || ''} ${r.assignedTo?.lastName || ''}`,
    },
    { key: 'priority', header: 'Priority', render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'dueDate', header: 'Due Date', render: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
  ];

  return (
    <Card padded={false} className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold text-slate-900">Tasks</h3>
        <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
          Assign Task
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          className="w-52"
          value={filters.assignedTo}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, assignedTo: e.target.value }));
          }}
        >
          <option value="">All Employees</option>
          {employees.map((e) => (
            <option key={e._id} value={e._id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </Select>
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, status: e.target.value }));
          }}
        >
          <option value="">All Statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Select
          className="w-40"
          value={filters.priority}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, priority: e.target.value }));
          }}
        >
          <option value="">All Priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </Select>
      </div>

      <Table columns={columns} data={tasks} loading={loading} emptyState={<EmptyState icon={ListChecks} title="No tasks found" />} />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        employees={employees}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />
    </Card>
  );
}
