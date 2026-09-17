import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';

const SEGMENTS = [
  { key: 'completed', label: 'Completed', color: '#1f5138' },
  { key: 'inProgress', label: 'In Progress', color: '#78b568' },
  { key: 'pending', label: 'Pending', color: '#c8e6c0' },
];

export function TaskProgressChart({ tasks, loading }) {
  if (loading) {
    return <Card className="h-full min-h-[220px] animate-pulse" />;
  }

  const counts = {
    completed: tasks.filter((t) => t.status === 'COMPLETED').length,
    inProgress: tasks.filter((t) => ['IN_PROGRESS', 'IN_REVIEW'].includes(t.status)).length,
    pending: tasks.filter((t) => t.status === 'TODO').length,
  };
  const total = counts.completed + counts.inProgress + counts.pending;

  const chartData = SEGMENTS.map((s) => ({ name: s.label, value: counts[s.key], color: s.color })).filter((d) => d.value > 0);

  return (
    <Card className="h-full">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="flex-1 w-full">
          <p className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Progress</p>
          <p className="text-sm text-slate-400 mb-5">Your task completion this period</p>

          {total === 0 ? (
            <EmptyState title="No tasks yet" />
          ) : (
            <div className="space-y-3">
              {SEGMENTS.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-sm font-medium text-slate-600 flex-1">{s.label}</span>
                  <span className="text-base font-extrabold text-slate-900">{counts[s.key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {total > 0 && (
          <div className="w-36 h-36 shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={3} stroke="none">
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-extrabold text-slate-900">{total}</span>
              <span className="text-[11px] text-slate-400 font-semibold">TASKS</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
