import { Clock, AlertTriangle, MapPin, House } from 'lucide-react';
import { MonthCalendarGrid, CELL_BASE } from './MonthCalendarGrid.jsx';
import { toneFor, STATUS_TEXT } from './attendanceCalendarFormat.js';

/**
 * One employee's attendance month (server: attendanceCalendarService) on the
 * same grid as the Salary calendar. The background colour is the day's status;
 * the clock appears only for finalized overtime (> 0, check-out recorded).
 */
export function AttendanceCalendar({ calendar }) {
  return <MonthCalendarGrid weeks={calendar.weeks} label={`${calendar.employeeName}, ${calendar.monthLabel} attendance`} renderCell={(cell) => <Cell cell={cell} />} />;
}

function Cell({ cell }) {
  const muted = ['UPCOMING', 'NOT_EMPLOYED', 'TODAY', 'WEEKLY_OFF'].includes(cell.status);
  const showLabel = cell.status !== 'UPCOMING';
  const label = cell.holiday && cell.status === 'HOLIDAY' ? cell.holiday : `${cell.label}${cell.leaveHalfDay ? ' (half day)' : ''}`;
  return (
    <div role="cell" data-status={cell.status} className={`${CELL_BASE} ${toneFor(cell.status)}`} aria-label={`${cell.day}: ${label}${cell.hasOvertime ? `, overtime ${cell.overtime}` : ''}`}>
      <div className="flex items-start justify-between gap-1">
        <span className={`text-sm font-bold ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{cell.day}</span>
        <span className="flex items-center gap-1">
          {cell.conflict && (
            <span title={cell.conflict}>
              <AlertTriangle size={13} className="text-amber-600" aria-label={cell.conflict} />
            </span>
          )}
          {cell.onsite && (
            <span title="Onsite work">
              <MapPin size={12} className="text-slate-500" aria-hidden="true" />
            </span>
          )}
          {cell.wfh && (
            <span title="Work from home">
              <House size={12} className="text-slate-500" aria-hidden="true" />
            </span>
          )}
          {cell.hasOvertime && (
            <span title={`Overtime ${cell.overtime}`} data-overtime="true">
              <Clock size={14} className="text-brand-800" aria-hidden="true" />
            </span>
          )}
        </span>
      </div>
      {showLabel && <p className={`mt-0.5 font-semibold leading-tight ${STATUS_TEXT[cell.status] || 'text-slate-700'}`}>{label}</p>}
      {cell.checkIn && (
        <div className="mt-0.5 tabular-nums text-slate-700">
          <p>In: {cell.checkIn}</p>
          {cell.checkOut ? <p>Out: {cell.checkOut}</p> : <p className="text-amber-800">Out: —</p>}
        </div>
      )}
      {cell.pendingLeave && <p className="mt-0.5 text-[10px] font-semibold text-slate-600">Leave request pending</p>}
    </div>
  );
}
