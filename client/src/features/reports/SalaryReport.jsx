import { useState } from 'react';
import { Download, FileText, Play, Search, Wallet, AlertTriangle, CalendarDays } from 'lucide-react';
import { CardHeader } from '../../components/Card.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Table } from '../../components/Table.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { getSalaryReport, downloadReportFile } from '../../services/reportService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useToast } from '../../hooks/useToast.js';
import { currentPayslipPeriod } from '../payslips/payslipFormat.js';
import { SalaryCalendar } from './SalaryCalendar.jsx';
import { useEmployeeOptions } from './useEmployeeOptions.js';


/**
 * Reports → Salary: each employee's month as a calendar (check-in, check-out,
 * overtime), downloadable as an A4-landscape PDF. Read-only; the screen, CSV and
 * PDF all come from the same server calculation (overtime: after 7 PM, from 6 PM).
 */
export function SalaryReport() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(() => currentPayslipPeriod()); // current month in India time
  const [result, setResult] = useState(null); // { rows, meta, params }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  // All Employees: which employee's calendar is open.
  const [openId, setOpenId] = useState(null);

  const { options } = useEmployeeOptions({ search, selectedId: employeeId, toast });

  const params = { month, employeeId: employeeId || undefined };
  // Exports always match what is on screen: they are enabled only for the generated filters.
  const isCurrent = result && result.params.month === month && (result.params.employeeId || '') === employeeId;

  const generate = async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('Please choose a month.');
    setLoading(true);
    setError('');
    try {
      const { rows, meta } = await getSalaryReport(params);
      setResult({ rows, calendars: meta.calendars || [], meta, params: { month, employeeId } });
      setOpenId(meta.calendars?.[0]?.employeeId || null);
    } catch (err) {
      setResult(null);
      setError(getErrorMessage(err, 'Could not load the salary report.'));
    } finally {
      setLoading(false);
    }
  };

  const exportAs = async (format, forEmployeeId = params.employeeId) => {
    setExporting(`${format}:${forEmployeeId || 'all'}`);
    try {
      await downloadReportFile('/reports/salary', { ...params, employeeId: forEmployeeId }, format);
      toast.success(`Salary Report exported as ${format.toUpperCase()}.`);
    } catch (err) {
      toast.error(err?.message || 'Could not export this report.');
    } finally {
      setExporting('');
    }
  };

  const canExport = isCurrent && result.rows.length > 0 && !exporting;
  const isAll = result && !result.params.employeeId;
  const openCalendar = result?.calendars.find((c) => c.employeeId === openId) || result?.calendars[0];

  return (
    <div>
      <CardHeader
        title="Salary Report"
        subtitle="Monthly attendance calendar: check-in, check-out and overtime (check-out after 7:00 PM counts from 6:00 PM). Attendance data only — no salary amounts."
      />

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
            <option value="">All Employees</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          {search && options.length === 0 && <p className="text-xs text-slate-500">No employees match “{search}”.</p>}
        </div>
        <Input label="Month" type="month" className="w-48" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Button icon={Play} loading={loading} onClick={generate}>
          Generate Report
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-5 border-t border-slate-100">
        <div className="text-sm font-semibold text-slate-600 min-h-[20px]">
          {error ? (
            <span className="inline-flex items-center gap-1.5 text-red-600" role="alert">
              <AlertTriangle size={15} /> {error}
            </span>
          ) : result ? (
            <span>
              {result.meta.employee} · {result.meta.monthLabel} · Days with check-ins: <span className="text-slate-900 font-extrabold">{result.rows.length}</span>
              {!isCurrent && <span className="text-amber-700"> — filters changed, generate again to update</span>}
            </span>
          ) : (
            <span className="text-slate-400">Choose an employee and month, then generate the report.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={Download} loading={exporting.startsWith('csv')} disabled={!canExport} onClick={() => exportAs('csv')}>
            Export CSV
          </Button>
          <Button variant="outline" icon={FileText} loading={exporting === `pdf:${params.employeeId || 'all'}`} disabled={!canExport} onClick={() => exportAs('pdf')}>
            {isAll ? 'Export PDF (all, 1 page each)' : 'Export PDF'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="mt-5 space-y-5">
          {result.calendars.length === 0 ? (
            <EmptyState icon={Wallet} title="No attendance records" description={`No attendance was recorded for ${result.meta.employee} in ${result.meta.monthLabel}.`} />
          ) : (
            <>
              {isAll && (
                <Table
                  keyField="employeeId"
                  data={result.calendars}
                  columns={[
                    { key: 'employeeName', header: 'Employee', render: (c) => <span className="font-medium text-slate-800">{c.employeeName}</span> },
                    { key: 'days', header: 'Days with Records', render: (c) => c.daysWithRecords },
                    { key: 'ot', header: 'Total Overtime', render: (c) => <span className="tabular-nums font-semibold text-brand-800">{c.totalOvertime}</span> },
                    {
                      key: 'actions',
                      header: '',
                      render: (c) => (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant={c.employeeId === openCalendar?.employeeId ? 'secondary' : 'ghost'} icon={CalendarDays} onClick={() => setOpenId(c.employeeId)}>
                            View calendar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={FileText}
                            loading={exporting === `pdf:${c.employeeId}`}
                            disabled={!isCurrent || Boolean(exporting) || c.daysWithRecords === 0}
                            onClick={() => exportAs('pdf', c.employeeId)}
                          >
                            Download PDF
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                />
              )}
              {openCalendar && (
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-slate-900">
                      {openCalendar.employeeName}
                      {openCalendar.employeeCode ? <span className="text-slate-400 font-medium"> ({openCalendar.employeeCode})</span> : null} — {openCalendar.monthLabel}
                    </h3>
                    <p className="text-sm text-slate-500">
                      Days with records: <span className="font-bold text-slate-800">{openCalendar.daysWithRecords}</span> · Total overtime:{' '}
                      <span className="font-bold text-brand-800">{openCalendar.totalOvertime}</span>
                    </p>
                  </div>
                  <SalaryCalendar calendar={openCalendar} />
                  <p className="mt-3 text-xs text-slate-400">
                    Overtime: zero for a check-out at or before 7:00 PM; after 7:00 PM it counts from 6:00 PM (company time; employee-specific times where HR set them). “—” = no
                    check-out recorded. “No record” = no attendance that day.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
