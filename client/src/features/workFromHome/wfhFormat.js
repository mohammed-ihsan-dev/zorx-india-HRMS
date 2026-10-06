import { formatDate } from '../../utils/formatters.js';

// WFH dates are stored as UTC-midnight calendar-day keys, so they're formatted
// in UTC to show the exact requested day regardless of the viewer's timezone.
export function formatWfhDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return formatDate(value, { ...options, timeZone: 'UTC' });
}
