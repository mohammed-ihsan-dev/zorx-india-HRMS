import { Link } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PriorityBadge } from '../../components/StatusBadge.jsx';
import { formatDate } from '../../utils/formatters.js';

export function TasksSummaryCard({ tasks, loading }) {
  if (loading) {
    return <Card className="h-full min-h-[220px] animate-pulse" />;
  }

  const topTasks = tasks.slice(0, 3);

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm font-bold uppercase tracking-wider text-slate-500">My Tasks</p>
        <Link to="/tasks" className="text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline">
          View all
        </Link>
      </div>

      {topTasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon={ListChecks} title="No tasks assigned" />
        </div>
      ) : (
        <div className="space-y-4">
          {topTasks.map((task) => (
            <div key={task._id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{task.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}</p>
              </div>
              <PriorityBadge priority={task.priority} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
