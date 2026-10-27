import { useCallback, useEffect, useState } from 'react';
import { ReceiptText, Eye, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import * as documentService from '../../services/documentService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useToast } from '../../hooks/useToast.js';
import { formatDate } from '../../utils/formatters.js';
import { payslipPeriodLabel, payslipFileName } from '../../features/payslips/payslipFormat.js';

/** The signed-in employee's own payslips (the server only ever returns theirs). */
export function Payslips() {
  const toast = useToast();
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // `${id}:open` | `${id}:download`

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    documentService
      .listMyPayslips()
      .then(setPayslips)
      .catch((err) => setError(getErrorMessage(err, 'Unable to load your payslips.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const run = async (slip, action) => {
    setBusy(`${slip._id}:${action}`);
    try {
      if (action === 'open') await documentService.previewDocument(slip._id);
      else await documentService.downloadDocument(slip._id, payslipFileName(slip.payslipPeriod));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Unable to open this payslip.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Payslips</h2>
        <p className="text-base text-slate-500 mt-1">Monthly payslips shared by HR.</p>
      </div>

      {loading ? (
        <ul className="space-y-3" aria-busy="true" aria-label="Loading payslips">
          {[1, 2, 3].map((i) => (
            <li key={i} className="h-[76px] rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </ul>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center space-y-3">
          <AlertTriangle size={24} className="mx-auto text-red-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={load}>
            Try again
          </Button>
        </div>
      ) : payslips.length === 0 ? (
        <div className="flex flex-col items-center text-center py-14 px-4">
          <span className="w-20 h-20 rounded-full bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center" aria-hidden="true">
            <ReceiptText size={32} />
          </span>
          <p className="mt-4 text-base font-bold text-slate-900">No payslips yet</p>
          <p className="mt-1 text-sm text-slate-500 max-w-xs">Your payslips will appear here once HR uploads them.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {payslips.map((slip) => (
            <li key={slip._id} className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0" aria-hidden="true">
                  <ReceiptText size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-900 truncate">{payslipPeriodLabel(slip.payslipPeriod)}</p>
                  <p className="text-xs text-slate-500">Uploaded {formatDate(slip.updatedAt || slip.createdAt)}</p>
                </div>
              </div>
              {/* Full-width buttons on phones; inline from sm up. */}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Eye}
                  loading={busy === `${slip._id}:open`}
                  disabled={Boolean(busy)}
                  onClick={() => run(slip, 'open')}
                  aria-label={`Open ${payslipPeriodLabel(slip.payslipPeriod)} payslip`}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  icon={Download}
                  loading={busy === `${slip._id}:download`}
                  disabled={Boolean(busy)}
                  onClick={() => run(slip, 'download')}
                  aria-label={`Download ${payslipPeriodLabel(slip.payslipPeriod)} payslip`}
                >
                  Download
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
