import { useCallback, useEffect, useRef, useState } from 'react';
import { ReceiptText, UploadCloud, Eye } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import * as documentService from '../../services/documentService.js';
import * as employeeService from '../../services/employeeService.js';
import { formatDateTime } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { payslipPeriodLabel, currentPayslipPeriod, PAYSLIP_MONTHS } from '../../features/payslips/payslipFormat.js';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const employeeName = (e) => `${e?.firstName || ''} ${e?.lastName || ''}`.trim() || '—';

const CURRENT = currentPayslipPeriod();
const CURRENT_YEAR = Number(CURRENT.slice(0, 4));
const YEARS = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i));

/** HR/Admin: upload monthly payslip PDFs per employee and review what's been uploaded. */
export function AdminPayslips() {
  const toast = useToast();
  const fileInput = useRef(null);

  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ employeeId: '', year: CURRENT.slice(0, 4), month: CURRENT.slice(5, 7) });
  const [file, setFile] = useState(null);
  const [formError, setFormError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState(null); // pending upload awaiting "Replace" confirmation

  const [filters, setFilters] = useState({ employeeId: '', year: '', month: '' });
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    employeeService
      .listEmployees({ status: 'ACTIVE', limit: 500 })
      .then((res) => setEmployees((res.data || []).slice().sort((a, b) => employeeName(a).localeCompare(employeeName(b)))))
      .catch((err) => toast.error(getErrorMessage(err, 'Unable to load employees.')));
  }, [toast]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    documentService
      .listPayslips({ employeeId: filters.employeeId || undefined, year: filters.year || undefined, month: filters.month || undefined })
      .then(setPayslips)
      .catch((err) => setLoadError(getErrorMessage(err, 'Unable to load payslips.')))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(load, [load]);

  const period = `${form.year}-${form.month}`;

  const onFileChange = (e) => {
    setFormError('');
    const selected = e.target.files?.[0] || null;
    if (selected && selected.type !== 'application/pdf') {
      setFile(null);
      setFormError('Payslips must be PDF files.');
      return;
    }
    if (selected && selected.size > MAX_SIZE_BYTES) {
      setFile(null);
      setFormError('File size exceeds the allowed limit of 5MB.');
      return;
    }
    setFile(selected);
  };

  const submit = async (replace = false) => {
    setFormError('');
    if (!form.employeeId) return setFormError('Please select an employee.');
    if (period > CURRENT) return setFormError('Payslips cannot be uploaded for a future month.');
    if (!file) return setFormError('Please choose a PDF payslip.');

    setUploading(true);
    try {
      const res = await documentService.uploadPayslip({ employeeId: form.employeeId, period, file, replace });
      toast.success(res.message || 'Payslip uploaded.');
      setReplaceTarget(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      load();
    } catch (err) {
      if (err?.response?.status === 409 && !replace) {
        setReplaceTarget({ name: employeeName(employees.find((e) => e._id === form.employeeId)), period });
      } else {
        setReplaceTarget(null);
        setFormError(getErrorMessage(err, 'Unable to upload the payslip.'));
      }
    } finally {
      setUploading(false);
    }
  };

  const open = async (slip) => {
    try {
      await documentService.previewDocument(slip._id);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Unable to open this payslip.'));
    }
  };

  const columns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{employeeName(r.employeeId)}</p>
          <p className="text-xs text-slate-400">{r.employeeId?.employeeCode}</p>
        </div>
      ),
    },
    { key: 'period', header: 'Month', render: (r) => payslipPeriodLabel(r.payslipPeriod) },
    { key: 'file', header: 'File', render: (r) => <span className="max-w-[180px] truncate block" title={r.originalFileName}>{r.originalFileName}</span> },
    { key: 'updatedAt', header: 'Uploaded', render: (r) => formatDateTime(r.updatedAt || r.createdAt) },
    { key: 'uploadedBy', header: 'Uploaded By', render: (r) => r.uploadedBy?.email || '—' },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <Button size="sm" variant="ghost" icon={Eye} onClick={() => open(r)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Payslips</h2>
        <p className="text-base text-slate-500 mt-1">Upload monthly payslip PDFs. Each employee sees only their own.</p>
      </div>

      <Card padded={false} className="p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Upload Payslip</h3>
        <form
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <Select label="Employee" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
            <option value="">Select employee</option>
            {employees.map((e) => (
              <option key={e._id} value={e._id}>
                {employeeName(e)}
                {e.employeeCode ? ` (${e.employeeCode})` : ''}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Month" value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}>
              {PAYSLIP_MONTHS.map((m, i) => {
                const value = String(i + 1).padStart(2, '0');
                return (
                  <option key={value} value={value} disabled={`${form.year}-${value}` > CURRENT}>
                    {m}
                  </option>
                );
              })}
            </Select>
            <Select label="Year" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="payslip-file" className="text-[15px] font-semibold text-slate-800 tracking-tight">
              Payslip PDF
            </label>
            <input
              id="payslip-file"
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              onChange={onFileChange}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2.5 file:font-semibold file:text-brand-800 border border-slate-300 rounded-xl p-1.5 bg-white"
            />
          </div>
          <Button type="submit" icon={UploadCloud} loading={uploading && !replaceTarget}>
            Upload
          </Button>
        </form>
        {formError && <p className="mt-3 text-sm font-medium text-red-600" role="alert">{formError}</p>}
        <p className="mt-3 text-xs text-slate-400">PDF only · Max 5MB · One payslip per employee per month</p>
      </Card>

      <Card padded={false} className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
          <h3 className="font-semibold text-slate-900">Uploaded Payslips</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:w-[560px]">
            <Select value={filters.employeeId} onChange={(e) => setFilters((f) => ({ ...f, employeeId: e.target.value }))} aria-label="Filter by employee">
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>
                  {employeeName(e)}
                </option>
              ))}
            </Select>
            <Select value={filters.month} onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))} aria-label="Filter by month">
              <option value="">All months</option>
              {PAYSLIP_MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, '0')}>
                  {m}
                </option>
              ))}
            </Select>
            <Select value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))} aria-label="Filter by year">
              <option value="">All years</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {loadError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-red-800">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        ) : (
          <Table
            columns={columns}
            data={payslips}
            loading={loading}
            emptyState={<EmptyState icon={ReceiptText} title="No payslips found" description="Uploaded payslips will appear here." />}
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(replaceTarget)}
        onClose={() => setReplaceTarget(null)}
        onConfirm={() => submit(true)}
        loading={uploading}
        title="Replace payslip?"
        description={
          replaceTarget
            ? `${replaceTarget.name} already has a payslip for ${payslipPeriodLabel(replaceTarget.period)}. Replacing it removes the current file; the employee will see the new one.`
            : ''
        }
        confirmLabel="Replace"
        variant="danger"
      />
    </div>
  );
}
