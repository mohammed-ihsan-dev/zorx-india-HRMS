import { MonthCalendarGrid, CELL_BASE } from './MonthCalendarGrid.jsx';

/**
 * One employee's month (server: salaryReportService.buildCalendarMonth) as a
 * Monday-first grid — the same cells as the A4 landscape PDF. Shows only what
 * was recorded: In / Out ("—" = no check-out) / OT, a status for records without
 * a check-in, "No record" for past days without attendance, nothing for future days.
 */
export function SalaryCalendar({ calendar }) {
  return <MonthCalendarGrid weeks={calendar.weeks} label={`${calendar.employeeName}, ${calendar.monthLabel}`} renderCell={(cell) => <Cell cell={cell} />} />;
}

function Cell({ cell }) {
  const base = CELL_BASE;
  const tone = cell.holiday ? 'bg-violet-50' : cell.isSunday ? 'bg-slate-50' : 'bg-white';
  return (
    <div role="cell" className={`${base} ${tone}`}>
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-bold text-slate-900">{cell.day}</span>
        {cell.holiday && <span className="text-[10px] font-bold text-violet-700 text-right leading-tight">{cell.holiday}</span>}
        {cell.onsite && !cell.holiday && <span className="text-[10px] font-bold text-sky-700 text-right leading-tight">Onsite Work</span>}
      </div>
      {cell.kind === 'record' && (
        <div className="mt-1 tabular-nums">
          <p className="text-slate-700">In: {cell.checkIn}</p>
          {cell.checkOut ? <p className="text-slate-700">Out: {cell.checkOut}</p> : <p className="text-amber-700">Out: — (no check-out)</p>}
          <p className={cell.overtimeMinutes > 0 ? 'font-semibold text-brand-800' : 'text-slate-400'}>OT: {cell.overtime}</p>
          {cell.onsite && cell.holiday && <p className="font-semibold text-sky-700">Onsite Work</p>}
        </div>
      )}
      {cell.kind === 'status' && (
        <div className="mt-1">
          <p className="font-semibold text-slate-700">{cell.statusLabel}</p>
          <p className="text-slate-400">No check-in</p>
        </div>
      )}
      {cell.kind === 'no-record' && <p className="mt-1 text-slate-400">No record</p>}
    </div>
  );
}
