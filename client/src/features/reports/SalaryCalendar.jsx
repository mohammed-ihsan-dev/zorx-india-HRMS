const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * One employee's month (server: salaryReportService.buildCalendarMonth) as a
 * Monday-first grid — the same cells as the A4 landscape PDF. Shows only what
 * was recorded: In / Out ("—" = no check-out) / OT, a status for records without
 * a check-in, "No record" for past days without attendance, nothing for future days.
 */
export function SalaryCalendar({ calendar }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] rounded-xl border border-slate-200 overflow-hidden" role="table" aria-label={`${calendar.employeeName}, ${calendar.monthLabel}`}>
        <div className="grid grid-cols-7 bg-brand-100/70 border-b border-slate-200" role="row">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="px-2.5 py-2 text-xs font-bold text-brand-800">
              {d}
            </div>
          ))}
        </div>
        {calendar.weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 border-slate-200" role="row">
            {week.map((cell, ci) => (
              <Cell key={ci} cell={cell} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Cell({ cell }) {
  const base = 'min-h-[96px] px-2.5 py-2 border-r last:border-r-0 border-slate-200 text-xs leading-relaxed';
  if (!cell) return <div role="cell" className={`${base} bg-slate-50/60`} />;
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
