import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Play, Search, Wallet, AlertTriangle } from 'lucide-react';
import { CardHeader } from '../../components/Card.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Table } from '../../components/Table.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import * as employeeService from '../../services/employeeService.js';
import { getSalaryReport, downloadReportFile } from '../../services/reportService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useToast } from '../../hooks/useToast.js';
import { currentPayslipPeriod } from '../payslips/payslipFormat.js';

const employeeName = (e) => `${e?.firstName || ''} ${e?.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'Unnamed';

const COLUMNS = [
  { key: 'employeeName', header: 'Employee Name', render: (r) => <span className="font-medium text-slate-800">{r.employeeName}</span> },
  { key: 'date', header: 'Date', render: (r) => r.date },
  { key: 'checkIn', header: 'Check-in Time', render: (r) => <span className="tabular-nums">{r.checkIn}</span> },
  { key: 'checkOut', header: 'Check-out Time', render: (r) => <span className="tabular-nums">{r.checkOut}</span> },
  {
    key: 'overtime',
    header: 'Overtime Used',
    render: (r) => <span className={`tabular-nums font-semibold ${r.overtimeMinutes > 0 ? 'text-brand-800' : 'text-slate-500'}`}>{r.overtime}</span>,
  },
];

/**
 * Reports → Salary: per-day check-in/check-out and time worked after 7:00 PM.
 * Read-only; rows, CSV and PDF all come from the same server calculation.
 */
export function SalaryReport() {
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(() => currentPayslipPeriod()); // current month in India time
  const [result, setResult] = useState(null); // { rows, meta, params }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    employeeService
      .listEmployees({ limit: 500 })
      .then((res) => setEmployees((res.data || []).slice().sort((a, b) => employeeName(a).localeCompare(employeeName(b)))))
      .catch((err) => toast.error(getErrorMessage(err, 'Unable to load employees.')));
  }, [toast]);

  // Same names get the employee code (or a short id) so they can be told apart.
  const options = useMemo(() => {
    const counts = employees.reduce((m, e) => m.set(employeeName(e), (m.get(employeeName(e)) || 0) + 1), new Map());
    const q = search.trim().toLowerCase();
    return employees
      .map((e) => {
        const name = employeeName(e);
        const tag = counts.get(name) > 1 || e.status === 'INACTIVE' ? ` (${[e.employeeCode || `#${e._id.slice(-4)}`, e.status === 'INACTIVE' && 'inactive'].filter(Boolean).join(', ')})` : '';
        return { id: e._id, label: `${name}${tag}`, haystack: `${name} ${e.employeeCode || ''}`.toLowerCase() };
      })
      .filter((o) => !q || o.haystack.includes(q) || o.id === employeeId);
  }, [employees, search, employeeId]);

  const params = { month, employeeId: employeeId || undefined };
  // Exports always match what is on screen: they are enabled only for the generated filters.
  const isCurrent = result && result.params.month === month && (result.params.employeeId || '') === employeeId;

  const generate = async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('Please choose a month.');
    setLoading(true);
    setError('');
    try {
      const { rows, meta } = await getSalaryReport(params);
      setResult({ rows: rows.map((r, i) => ({ ...r, key: `${r.dateKey}-${i}` })), meta, params: { month, employeeId } });
    } catch (err) {
      setResult(null);
      setError(getErrorMessage(err, 'Could not load the salary report.'));
    } finally {
      setLoading(false);
    }
  };

  const exportAs = async (format) => {
    setExporting(format);
    try {
      await downloadReportFile('/reports/salary', params, format);
      toast.success(`Salary Report exported as ${format.toUpperCase()}.`);
    } catch (err) {
      toast.error(err?.message || 'Could not export this report.');
    } finally {
      setExporting('');
    }
  };

  const canExport = isCurrent && result.rows.length > 0 && !exporting;

  return (
    <div>
      <CardHeader title="Salary Report" subtitle="Daily check-in, check-out and overtime worked after 7:00 PM. Attendance data only — no salary amounts." />

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
              {result.meta.employee} · {result.meta.monthLabel} · Records Found: <span className="text-slate-900 font-extrabold">{result.rows.length}</span>
              {!isCurrent && <span className="text-amber-700"> — filters changed, generate again to update</span>}
            </span>
          ) : (
            <span className="text-slate-400">Choose an employee and month, then generate the report.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={Download} loading={exporting === 'csv'} disabled={!canExport} onClick={() => exportAs('csv')}>
            Export CSV
          </Button>
          <Button variant="outline" icon={FileText} loading={exporting === 'pdf'} disabled={!canExport} onClick={() => exportAs('pdf')}>
            Export PDF
          </Button>
        </div>
      </div>

      {result && (
        <div className="mt-5">
          <h3 className="text-base font-bold text-slate-900 mb-3">
            Salary Report — {result.meta.monthLabel} · {result.meta.employee}
          </h3>
          <Table
            columns={COLUMNS}
            data={result.rows}
            keyField="key"
            loading={loading}
            emptyState={
              <EmptyState icon={Wallet} title="No attendance records" description={`No check-ins were recorded for ${result.meta.employee} in ${result.meta.monthLabel}.`} />
            }
          />
          {result.rows.length > 0 && <p className="mt-3 text-xs text-slate-400">Overtime Used = time worked after 7:00 PM, from the recorded check-out. “—” means no check-out was recorded.</p>}
        </div>
      )}
    </div>
  );
}
