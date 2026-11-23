import { useEffect, useRef, useState } from 'react';
import { Download, Search, AlertTriangle, CalendarX, Briefcase, HeartPulse, HeartHandshake, Ban, Sigma } from 'lucide-react';
import { CardHeader } from '../../components/Card.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { getLeaveHistory, getLeaveStats, downloadReportCsv } from '../../services/reportService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useToast } from '../../hooks/useToast.js';
import { useMobileShell } from '../../context/MobileShellContext.jsx';
import { leaveTypeName } from '../leave/leaveFormat.js';
import { useEmployeeOptions, employeeName } from './useEmployeeOptions.js';
import {
  LEAVE_REPORT_PERIODS,
  LEAVE_REPORT_STATUSES,
  LEAVE_REPORT_TYPES,
  buildLeaveReportParams,
  formatDayNumber,
  leaveDurationText,
  sickRemainingCard,
  periodRangeText,
} from './leaveReportFormat.js';

const PAGE_SIZE = 10;
const dayKeyDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const istDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
// "1 day", "0.5 day", "3 days" (no unit while loading).
const dayUnit = (n) => (n === undefined ? undefined : Number(n) > 1 ? 'days' : 'day');
const titleStatus = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All Statuses');

function StatTile({ label, value, unit, hint, icon: Icon, tone, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{label}</p>
        <span className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${tone}`} aria-hidden="true">
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs font-medium text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Reports → Leave: employee-wise leave statistics, Sick Leave balance and leave
 * history for a reporting period (current month by default), with CSV export.
 * Statistics, history and export use the same filters and server calculations;
 * an out-of-date answer is ignored, so fast switching never shows stale data.
 */
export function LeaveReport() {
  const toast = useToast();
  const mobile = useMobileShell();
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod] = useState('current_month');
  const [range, setRange] = useState({ from: '', to: '' });
  const [status, setStatus] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [stats, setStats] = useState({ loading: true, error: '', data: null });
  const [history, setHistory] = useState({ loading: true, error: '', rows: [], meta: null });
  const [exporting, setExporting] = useState(false);
  const { options } = useEmployeeOptions({ search, selectedId: employeeId, toast });
  const statsReq = useRef(0);
  const historyReq = useRef(0);

  const base = buildLeaveReportParams({ employeeId, period, from: range.from, to: range.to, leaveType });
  const baseKey = JSON.stringify(base);
  const filterKey = `${baseKey}|${status}`;
  // The page belongs to one set of filters: any filter change starts again at page 1.
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const historyParams = base && { ...base, ...(status ? { status } : {}) };

  useEffect(() => {
    if (!base) return;
    const id = ++statsReq.current;
    setStats((s) => ({ ...s, loading: true, error: '' }));
    getLeaveStats(base)
      .then((data) => id === statsReq.current && setStats({ loading: false, error: '', data }))
      .catch((err) => id === statsReq.current && setStats({ loading: false, error: getErrorMessage(err, 'Could not load leave statistics.'), data: null }));
  }, [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!historyParams) return;
    const id = ++historyReq.current;
    setHistory((h) => ({ ...h, loading: true, error: '' }));
    getLeaveHistory({ ...historyParams, page, limit: PAGE_SIZE })
      .then(({ rows, meta }) => id === historyReq.current && setHistory({ loading: false, error: '', rows, meta }))
      .catch((err) => id === historyReq.current && setHistory({ loading: false, error: getErrorMessage(err, 'Could not load leave history.'), rows: [], meta: null }));
  }, [filterKey, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePeriod = (value) => {
    // Custom starts from the period on screen, so the dates are never blank.
    if (value === 'custom' && !range.from && stats.data?.period?.from) setRange({ from: stats.data.period.from, to: stats.data.period.to });
    setPeriod(value);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadReportCsv('/reports/leave', historyParams);
      toast.success('Leave Report exported successfully.');
    } catch (err) {
      toast.error(err?.message || 'Could not export this report.');
    } finally {
      setExporting(false);
    }
  };

  const customInvalid = period === 'custom' && range.from && range.to && range.to < range.from;
  const taken = stats.data?.taken;
  const num = (v) => (stats.loading && !taken ? '…' : formatDayNumber(v));
  const sick = sickRemainingCard(stats.data?.sickBalance, Boolean(employeeId));
  const total = history.meta?.total ?? 0;
  const selectedName = stats.data?.employee?.name;

  const columns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-900">{employeeName(r.employeeId)}</p>
          {r.employeeId?.employeeCode && <p className="text-xs text-slate-500">{r.employeeId.employeeCode}</p>}
        </div>
      ),
    },
    { key: 'leaveType', header: 'Leave Type', render: (r) => leaveTypeName(r.leaveType) },
    { key: 'startDate', header: 'Start Date', render: (r) => dayKeyDate(r.startDate) },
    { key: 'endDate', header: 'End Date', render: (r) => dayKeyDate(r.endDate) },
    { key: 'duration', header: 'Duration', render: (r) => leaveDurationText(r) },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) => (
        <span className="block max-w-[220px] truncate" title={r.reason}>
          {r.reason}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'approvedBy', header: 'Approved By', render: (r) => r.approvedByName || '—' },
    { key: 'createdAt', header: 'Applied On', render: (r) => istDate(r.createdAt) },
  ];

  const empty = (
    <EmptyState
      icon={CalendarX}
      title="No leave records"
      description={period === 'all' ? 'No leave matches these filters.' : 'No leave in this period. Try another period, All Time or clearing a filter.'}
    />
  );

  return (
    <div>
      <CardHeader title="Leave Report" subtitle="Employee-wise leave usage, Sick Leave balance and leave history." />

      {/* Filters */}
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
        <Select id="leave-report-period" label="Reporting Period" className="w-full sm:w-52" value={period} onChange={(e) => choosePeriod(e.target.value)}>
          {LEAVE_REPORT_PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        {period === 'custom' && (
          <>
            <Input id="leave-report-from" label="Start Date" type="date" className="w-full sm:w-44" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            <Input
              id="leave-report-to"
              label="End Date"
              type="date"
              className="w-full sm:w-44"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              error={customInvalid ? 'Must be on or after the start date.' : undefined}
            />
          </>
        )}
        <Select id="leave-report-status" label="Status" className="w-full sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          {LEAVE_REPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleStatus(s)}
            </option>
          ))}
        </Select>
        <Select id="leave-report-type" label="Leave Type" className="w-full sm:w-40" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
          {LEAVE_REPORT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t ? leaveTypeName(t) : 'All Types'}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-5">
        <p className="text-sm font-semibold text-slate-600">
          {!base ? (
            <span className="text-slate-400">Choose a start and end date.</span>
          ) : (
            <>
              {selectedName || 'All Employees'} · {stats.data?.period?.label || '…'}
              {stats.data?.period?.from && <span className="text-slate-400 font-medium"> ({periodRangeText(stats.data.period)})</span>}
            </>
          )}
        </p>
        <Button icon={Download} loading={exporting} disabled={!base || exporting || history.loading || total === 0} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      {/* Statistics */}
      {stats.error ? (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-red-600" role="alert">
          <AlertTriangle size={15} /> {stats.error}
        </p>
      ) : (
        <div className={`mt-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 ${stats.loading && taken ? 'opacity-60 transition-opacity' : ''}`} aria-busy={stats.loading || undefined}>
          <StatTile label="Casual Leave Taken" value={num(taken?.casual)} unit={dayUnit(taken?.casual)} icon={Briefcase} tone="bg-sky-50 text-sky-800 border-sky-200" />
          <StatTile label="Sick Leave Taken" value={num(taken?.sick)} unit={dayUnit(taken?.sick)} icon={HeartPulse} tone="bg-amber-50 text-amber-800 border-amber-200" />
          <StatTile label="Sick Leave Remaining" value={sick.value} hint={sick.hint} icon={HeartHandshake} tone="bg-emerald-50 text-emerald-800 border-emerald-200" />
          <StatTile label="LoP Taken" value={num(taken?.lop)} unit={dayUnit(taken?.lop)} icon={Ban} tone="bg-red-50 text-red-800 border-red-200" />
          <StatTile
            label="Total Leave Taken"
            value={num(taken?.total)}
            unit={dayUnit(taken?.total)}
            hint={taken?.other ? `Includes ${formatDayNumber(taken.other)} day(s) of other leave types` : undefined}
            icon={Sigma}
            tone="bg-brand-50 text-brand-800 border-brand-200"
            className="col-span-2 lg:col-span-1"
          />
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Taken = approved leave only (half day = 0.5); pending, rejected and cancelled leave are not counted. Sick Leave Remaining is today&apos;s balance, not limited to the period.
      </p>

      {/* Leave history */}
      <div className="mt-6 pt-5 border-t border-slate-100">
        <h3 className="text-base font-bold text-slate-900 mb-3">Leave History</h3>
        {history.error ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600" role="alert">
            <AlertTriangle size={15} /> {history.error}
          </p>
        ) : !base ? null : mobile ? (
          history.loading && !history.rows.length ? (
            <div className="h-40 rounded-xl bg-slate-100 animate-pulse" />
          ) : history.rows.length === 0 ? (
            empty
          ) : (
            <ul className={`space-y-3 ${history.loading ? 'opacity-60' : ''}`}>
              {history.rows.map((r) => (
                <li key={r._id} className="rounded-2xl border border-slate-200/90 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{employeeName(r.employeeId)}</p>
                      <p className="text-sm text-slate-600">
                        {leaveTypeName(r.leaveType)} · {leaveDurationText(r)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    {dayKeyDate(r.startDate)}
                    {r.endDate && String(r.endDate) !== String(r.startDate) ? ` – ${dayKeyDate(r.endDate)}` : ''}
                  </p>
                  {r.reason && <p className="mt-1 text-sm text-slate-500 break-words">{r.reason}</p>}
                  <p className="mt-2 text-xs text-slate-500">
                    Applied {istDate(r.createdAt)}
                    {r.approvedByName ? ` · Approved by ${r.approvedByName}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className={history.loading && history.rows.length ? 'opacity-60 transition-opacity' : ''}>
            <Table columns={columns} data={history.rows} loading={history.loading && !history.rows.length} emptyState={empty} />
          </div>
        )}
        {base && !history.error && total > 0 && (
          <Pagination
            page={page}
            pages={history.meta?.pages}
            total={total}
            limit={PAGE_SIZE}
            itemLabel="leave records"
            onPageChange={(p) => setPageState({ key: filterKey, page: p })}
          />
        )}
      </div>
    </div>
  );
}
