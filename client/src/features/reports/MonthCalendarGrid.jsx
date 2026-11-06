import { Fragment } from 'react';

/** Shared cell box (size, padding, grid lines) — every calendar cell starts from this. */
export const CELL_BASE = 'min-h-[96px] px-2.5 py-2 border-r last:border-r-0 border-slate-200 text-xs leading-relaxed';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * The Monday-first month grid shared by the Salary and Attendance report
 * calendars (server: salaryReportService.buildMonthGrid). `renderCell(cell)`
 * draws each in-month day; out-of-month slots are blank.
 */
export function MonthCalendarGrid({ weeks, label, renderCell }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] rounded-xl border border-slate-200 overflow-hidden" role="table" aria-label={label}>
        <div className="grid grid-cols-7 bg-brand-100/70 border-b border-slate-200" role="row">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="px-2.5 py-2 text-xs font-bold text-brand-800">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 border-slate-200" role="row">
            {week.map((cell, ci) =>
              cell ? (
                <Fragment key={ci}>{renderCell(cell)}</Fragment>
              ) : (
                <div key={ci} role="cell" className={`${CELL_BASE} bg-slate-50/60`} />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
