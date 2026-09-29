import { Badge } from './Badge.jsx';
import { STATUS_COLORS, PRIORITY_COLORS } from '../utils/constants.js';
import { titleCase } from '../utils/formatters.js';

export function StatusBadge({ status }) {
  const label = status === 'REMAINING' ? 'Upcoming' : titleCase(status);
  return <Badge color={STATUS_COLORS[status] || 'slate'}>{label}</Badge>;
}

export function PriorityBadge({ priority }) {
  return <Badge color={PRIORITY_COLORS[priority] || 'slate'}>{titleCase(priority)}</Badge>;
}
