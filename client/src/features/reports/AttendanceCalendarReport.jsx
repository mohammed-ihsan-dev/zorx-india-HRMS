import { useEffect, useRef, useState } from 'react';
import { Clock, Download, Search, AlertTriangle, CalendarDays } from 'lucide-react';
import { CardHeader } from '../../components/Card.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { getAttendanceCalendar, downloadReportCsv } from '../../services/reportService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useToast } from '../../hooks/useToast.js';
import { currentPayslipPeriod } from '../payslips/payslipFormat.js';
import { useEmployeeOptions } from './useEmployeeOptions.js';
import { AttendanceCalendar } from './AttendanceCalendar.jsx';
import { LEGEND, toneFor, summaryItems } from './attendanceCalendarFormat.js';

/** "2026-10" → { from: "2026-10-01", to: "2026-10-31" } for the existing CSV export. */
const monthBounds = (month) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
};

/**
 * Reports → Attendance: one employee's month as a colour-coded calendar
 * (statuses decided on the server). Loads automatically when the employee or
 * month changes; an out-of-date answer is ignored, so fast switching never
 * shows the wrong employee.
 */
export function AttendanceCalendarReport() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(() => currentPayslipPeriod());
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const { options } = useEmployeeOptions({ search, selectedId: employeeId, toast });
  const requestId = useRef(0);

  useEffect(() => {
    if (!employeeId || !/^\d{4}-\d{2}$/.test(month)) {
      setCalendar(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    getAttendanceCalendar({ employeeId, month })
      .then((data) => id === requestId.current && setCalendar(data))
      .catch((err) => {
        if (id !== requestId.current) return;
        setCalendar(null);
        setError(getErrorMessage(err, 'Could not load the attendance calendar.'));
      })
      .finally(() => id === requestId.current && setLoading(false));
  }, [employeeId, month]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadReportCsv('/reports/attendance', { employeeId, ...monthBounds(month) });
      toast.success('Attendance Report exported as CSV.');
    } catch (err) {
      toast.error(err?.message || 'Could not export this report.');
    } finally {
      setExporting(false);
    }
  };

  const conflicts = calendar ? calendar.weeks.flat().filter((c) => c?.conflict).length : 0;

  return (
    <div>
      <CardHeader title="Attendance Report" subtitle="Choose an employee and a month to see their attendance calendar." />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2 w-full sm:w-72">
          <Input
            label="Employee"
            placeholder="Search name or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            rightElement={<Search size={16} className="text-slate-400" aria-hidden="true" />}
            aria-label="Search employees"
          />
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="Employee">
            <option value="">Select an employee</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          {search && options.length === 0 && <p className="text-xs text-slate-500">No employees match “{search}”.</p>}
        </div>
        <Input label="Month" type="month" className="w-48" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Button variant="outline" icon={Download} loading={exporting} disabled={!calendar || exporting || loading} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 mt-5 text-xs font-semibold text-slate-600" aria-label="Legend">
        {LEGEND.map((l) => (
          <li key={l.status} className="flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 rounded border border-slate-300 ${toneFor(l.status)}`} aria-hidden="true" />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <Clock size={14} className="text-brand-800" aria-hidden="true" /> Overtime
        </li>
        <li className="flex items-center gap-1.5 text-slate-400">
          <span className="w-3.5 h-3.5 rounded border border-slate-300 bg-white" aria-hidden="true" /> Present / no colour
        </li>
      </ul>

      <div className="mt-5" aria-busy={loading || undefined}>
        {error ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600" role="alert">
            <AlertTriangle size={15} /> {error}
          </p>
        ) : !employeeId ? (
          <EmptyState icon={CalendarDays} title="No employee selected" description="Choose an employee to see their monthly attendance calendar." />
        ) : loading && !calendar ? (
          <div className="h-[520px] rounded-xl bg-slate-100 animate-pulse" />
        ) : calendar ? (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h3 className="text-base font-bold text-slate-900">
                {calendar.employeeName}
                {calendar.employeeCode ? <span className="text-slate-400 font-medium"> ({calendar.employeeCode})</span> : null} — {calendar.monthLabel}
              </h3>
              <p className="text-sm text-slate-500">
                {summaryItems(calendar.summary)
                  .map((i) => `${i.label} ${i.count}`)
                  .join(' · ') || 'No working days yet'}
                {' · '}Overtime <span className="font-bold text-brand-800">{calendar.totalOvertime}</span>
              </p>
            </div>
            {conflicts > 0 && (
              <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                <AlertTriangle size={14} aria-hidden="true" /> {conflicts} day{conflicts > 1 ? 's have' : ' has'} attendance on a full-day approved leave — shown as leave; please review.
              </p>
            )}
            <AttendanceCalendar calendar={calendar} />
            <p className="mt-3 text-xs text-slate-400">
              Absent = a finished working day (Sunday is the weekly off) with no check-in and no approved leave; pending leave requests don&apos;t count. Overtime clock: finalized overtime only
              (check-out after 7:00 PM counts from 6:00 PM, company time; employee-specific times where HR set them).
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
