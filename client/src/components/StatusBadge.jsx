import { Badge } from './Badge.jsx';
import { STATUS_COLORS, PRIORITY_COLORS } from '../utils/constants.js';
import { titleCase } from '../utils/formatters.js';

export function StatusBadge({ status }) {
  return <Badge color={STATUS_COLORS[status] || 'slate'}>{titleCase(status)}</Badge>;
}

export function PriorityBadge({ priority }) {
  return <Badge color={PRIORITY_COLORS[priority] || 'slate'}>{titleCase(priority)}</Badge>;
}
