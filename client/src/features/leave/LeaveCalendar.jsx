import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WEEKDAY_LABELS, MONTH_LABELS, buildMonthGrid, dayNumber, utcYMD, toDateInputValue } from '../../utils/calendarDate.js';
import { STATUS_COLORS } from '../../utils/constants.js';
import { titleCase } from '../../utils/formatters.js';

const STATUS_CELL_STYLES = {
  green: 'bg-brand-100 border-brand-300 text-brand-900',
  amber: 'bg-amber-50 border-amber-300 text-amber-800',
  red: 'bg-red-50 border-red-300 text-red-700',
  slate: 'bg-slate-100 border-slate-300 text-slate-500',
};

const LEGEND_ITEMS = [
  { status: 'APPROVED', label: 'Approved' },
  { status: 'PENDING', label: 'Pending' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: 'CANCELLED', label: 'Cancelled' },
];

const LEGEND_DOT_COLORS = {
  green: 'bg-brand-600',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  slate: 'bg-slate-400',
};

export function LeaveCalendar({ leaves, onDayClick }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [pickerOpen, setPickerOpen] = useState(false);

  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Map each visible day-number to the leave record covering it (first match wins).
  const leaveByDay = useMemo(() => {
    const map = new Map();
    for (const leave of leaves) {
      const start = utcYMD(leave.startDate);
      const end = utcYMD(leave.endDate);
      const startNum = dayNumber(start.y, start.m, start.d);
      const endNum = dayNumber(end.y, end.m, end.d);
      for (let n = startNum; n <= endNum; n += 1) {
        if (!map.has(n)) map.set(n, leave);
      }
    }
    return map;
  }, [leaves]);

  const goToMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const todayNum = dayNumber(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => goToMonth(-1)}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-brand-700 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="relative">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className="text-lg sm:text-xl font-bold text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            {MONTH_LABELS[viewMonth]} {viewYear}
          </button>
          {pickerOpen && (
            <div className="absolute z-20 top-full mt-1 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-xl shadow-popover p-3 flex gap-2">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
              >
                {MONTH_LABELS.map((label, idx) => (
                  <option key={label} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
              >
                {Array.from({ length: 7 }, (_, i) => today.getFullYear() - 3 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-xs font-semibold text-brand-700 px-2 hover:underline"
              >
                Done
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => goToMonth(1)}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-brand-700 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-sm text-slate-500">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.status} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${LEGEND_DOT_COLORS[STATUS_COLORS[item.status]]}`} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_LABELS.map((label, idx) => (
              <div
                key={label}
                className={`text-center text-sm font-bold py-2 ${idx === 0 || idx === 6 ? 'text-slate-400' : 'text-slate-500'}`}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">
                {week.map((cell, di) => {
                  if (!cell) return <div key={di} className="aspect-square sm:aspect-[4/3]" />;

                  const num = dayNumber(cell.year, cell.month, cell.day);
                  const isToday = num === todayNum;
                  const isPast = num < todayNum;
                  const leave = leaveByDay.get(num);
                  const statusColor = leave ? STATUS_COLORS[leave.status] || 'slate' : null;

                  return (
                    <button
                      key={di}
                      onClick={() => onDayClick(toDateInputValue(cell.year, cell.month, cell.day), leave || null)}
                      className={`aspect-square sm:aspect-[4/3] rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors ${
                        leave
                          ? STATUS_CELL_STYLES[statusColor]
                          : isToday
                          ? 'bg-brand-50 border-brand-300 hover:bg-brand-100'
                          : isPast
                          ? 'bg-slate-50/70 border-slate-100 text-slate-400 opacity-60 cursor-not-allowed'
                          : 'bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <span className={`text-base sm:text-lg font-bold ${isToday && !leave ? 'text-brand-800' : ''}`}>
                        {cell.day}
                      </span>
                      {leave && <span className="text-[11px] font-semibold leading-none">{titleCase(leave.leaveType)}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
