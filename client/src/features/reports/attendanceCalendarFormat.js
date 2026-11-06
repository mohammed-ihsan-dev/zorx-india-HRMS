// Colours and legend for the Attendance Report calendar. The status itself
// always comes from the server (attendanceCalendarService.classifyDay).

/** Cell background per day status (Present = the normal calendar background). */
export const STATUS_TONE = Object.freeze({
  LATE: 'bg-yellow-100',
  HALF_DAY: 'bg-orange-200',
  SICK_LEAVE: 'bg-slate-200',
  CASUAL_LEAVE: 'bg-purple-200',
  ABSENT: 'bg-red-200',
  PAID_LEAVE: 'bg-sky-100',
  OTHER_LEAVE: 'bg-sky-100',
  PRESENT: 'bg-white',
  HOLIDAY: 'bg-emerald-50',
  WEEKLY_OFF: 'bg-slate-50',
  TODAY: 'bg-white',
  UPCOMING: 'bg-white',
  NOT_EMPLOYED: 'bg-white',
});

/** Text colour of the status line, readable on its background. */
export const STATUS_TEXT = Object.freeze({
  LATE: 'text-yellow-900',
  HALF_DAY: 'text-orange-900',
  SICK_LEAVE: 'text-slate-800',
  CASUAL_LEAVE: 'text-purple-900',
  ABSENT: 'text-red-900',
  PAID_LEAVE: 'text-sky-900',
  OTHER_LEAVE: 'text-sky-900',
  PRESENT: 'text-brand-800',
  HOLIDAY: 'text-emerald-800',
  WEEKLY_OFF: 'text-slate-400',
  TODAY: 'text-slate-400',
  UPCOMING: 'text-slate-400',
  NOT_EMPLOYED: 'text-slate-400',
});

export const toneFor = (status) => STATUS_TONE[status] || 'bg-white';

/** The legend, in the order HR reads it; swatches use the same classes as the cells. */
export const LEGEND = Object.freeze([
  { status: 'LATE', label: 'Late' },
  { status: 'HALF_DAY', label: 'Half Day' },
  { status: 'SICK_LEAVE', label: 'Sick Leave' },
  { status: 'CASUAL_LEAVE', label: 'Casual Leave' },
  { status: 'ABSENT', label: 'Absent' },
  { status: 'PAID_LEAVE', label: 'Paid Leave' },
  { status: 'HOLIDAY', label: 'Holiday' },
]);

/** Short monthly summary line: "Present 18 · Late 2 · Absent 1 …" (only non-zero, working statuses). */
const SUMMARY_ORDER = [
  ['PRESENT', 'Present'],
  ['LATE', 'Late'],
  ['HALF_DAY', 'Half Day'],
  ['SICK_LEAVE', 'Sick Leave'],
  ['CASUAL_LEAVE', 'Casual Leave'],
  ['PAID_LEAVE', 'Paid Leave'],
  ['OTHER_LEAVE', 'Leave'],
  ['ABSENT', 'Absent'],
];
export function summaryItems(summary = {}) {
  return SUMMARY_ORDER.filter(([k]) => summary[k] > 0).map(([k, label]) => ({ status: k, label, count: summary[k] }));
}
