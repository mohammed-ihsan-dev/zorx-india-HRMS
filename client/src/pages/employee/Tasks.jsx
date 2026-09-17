import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { StatusBadge, PriorityBadge } from '../../components/StatusBadge.jsx';
import { Select } from '../../components/Input.jsx';
import * as taskService from '../../services/taskService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const STATUS_FLOW = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['IN_REVIEW', 'COMPLETED'],
  IN_REVIEW: ['IN_PROGRESS', 'COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function Tasks() {
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const load = () => {
    setLoading(true);
    taskService
      .getMyTasks()
      .then(setTasks)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (task, status) => {
    setUpdatingId(task._id);
    try {
      await taskService.updateTaskStatus(task._id, status);
      toast.success('Task status updated.');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState icon={ListChecks} title="No tasks assigned" description="Tasks assigned to you will show up here." />
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {tasks.map((task) => {
        const nextStatuses = STATUS_FLOW[task.status] || [];
        return (
          <Card key={task._id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-slate-900">{task.title}</h3>
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                </div>
                {task.description && <p className="text-sm text-slate-500 mt-1.5">{task.description}</p>}
                <div className="flex items-center gap-4 mt-2.5 text-xs text-slate-400">
                  <span>Assigned by {task.assignedBy?.email}</span>
                  {task.dueDate && <span>Due {formatDate(task.dueDate)}</span>}
                </div>
              </div>
              {nextStatuses.length > 0 && (
                <Select
                  className="w-40 shrink-0"
                  value=""
                  disabled={updatingId === task._id}
                  onChange={(e) => e.target.value && handleStatusChange(task, e.target.value)}
                >
                  <option value="">Update status…</option>
                  {nextStatuses.map((s) => (
                    <option key={s} value={s}>
                      Mark as {titleCase(s)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
