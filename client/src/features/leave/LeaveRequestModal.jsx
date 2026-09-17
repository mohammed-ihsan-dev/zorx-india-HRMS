import { useEffect, useState } from 'react';
import { UploadCloud, X, FileText, AlertTriangle, Info } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import * as leaveService from '../../services/leaveService.js';
import * as documentService from '../../services/documentService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { countDaysInclusive } from '../../utils/calendarDate.js';
import { formatDate, titleCase } from '../../utils/formatters.js';

const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'UNPAID'];
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function LeaveRequestModal({ open, onClose, initialDate, onSubmitted }) {
  const toast = useToast();
  const [form, setForm] = useState({ leaveType: 'CASUAL', startDate: '', endDate: '', reason: '' });
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todayYMD = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  useEffect(() => {
    if (open) {
      if (initialDate && initialDate < todayYMD) {
        onClose();
        return;
      }
      const defaultDate = initialDate && initialDate >= todayYMD ? initialDate : todayYMD;
      setForm({ leaveType: 'CASUAL', startDate: defaultDate, endDate: defaultDate, reason: '' });
      setFile(null);
      setFileError('');
      setError('');
    }
  }, [open, initialDate, todayYMD, onClose]);

  const days = countDaysInclusive(form.startDate, form.endDate);

  const handleFileChange = (e) => {
    setFileError('');
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setFileError('Unsupported document type. Please upload a PDF, JPG, or PNG file.');
      return;
    }
    if (selected.size > MAX_SIZE_BYTES) {
      setFileError('File size exceeds the allowed limit of 5MB.');
      return;
    }
    setFile(selected);
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.leaveType) return setError('Please select a leave type.');
    if (!form.startDate || !form.endDate) return setError('Please select an end date.');
    if (form.startDate < todayYMD) return setError('You cannot request leave for past dates.');
    if (days < 1) return setError('End date must be on or after the start date.');
    if (!form.reason.trim()) return setError('Please provide a reason.');

    setSubmitting(true);
    try {
      let supportingDocumentId = null;
      if (file) {
        const uploaded = await documentService.uploadDocument('MEDICAL_PROOF', file);
        supportingDocumentId = uploaded._id;
      }
      await leaveService.createLeave({ ...form, supportingDocumentId });
      toast.success('Leave request submitted successfully.');
      onSubmitted();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to submit leave request.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Request Leave">
      <p className="text-base font-semibold text-brand-800 -mt-1 mb-4">
        {form.startDate ? formatDate(form.startDate, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : ''}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}

        <Select label="Leave Type" value={form.leaveType} onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}>
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {titleCase(t)} Leave {t === 'CASUAL' ? '(User Risk - 0 Allowed)' : ''}
            </option>
          ))}
        </Select>

        {form.leaveType === 'CASUAL' && (
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span>Company policy allows 0 casual leaves. You may submit casual leave at your own risk.</span>
          </div>
        )}

        {form.leaveType === 'EARNED' && (
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-900 bg-brand-50 border border-brand-200 rounded-lg p-2.5">
            <Info size={16} className="text-brand-600 shrink-0" />
            <span>Maximum 1 Earned (Paid) Leave is allowed per calendar month.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            type="date"
            label="Start Date"
            min={todayYMD}
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            required
          />
          <Input
            type="date"
            label="End Date"
            min={form.startDate || todayYMD}
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            required
          />
        </div>

        {days > 0 && (
          <p className="text-sm font-semibold text-slate-500 -mt-2">
            {days} day{days > 1 ? 's' : ''}
          </p>
        )}

        <Textarea
          label="Reason"
          rows={3}
          placeholder="Please provide a short reason for your leave request."
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          required
        />

        {form.leaveType === 'SICK' && (
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Supporting Document</label>
            {!file ? (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-5 px-4 cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors">
                <UploadCloud size={20} className="text-slate-400" />
                <span className="text-sm font-semibold text-slate-600">Upload Prescription / Medical Proof</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
              </label>
            ) : (
              <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-3.5 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={18} className="text-brand-700 shrink-0" />
                  <span className="text-sm font-medium text-slate-700 truncate">{file.name}</span>
                </div>
                <button type="button" onClick={() => setFile(null)} className="text-slate-400 hover:text-red-600 shrink-0">
                  <X size={16} />
                </button>
              </div>
            )}
            {fileError && <p className="text-xs text-red-600 mt-1.5">{fileError}</p>}
            <p className="text-xs text-slate-400 mt-1.5">PDF, JPG or PNG · Max 5MB · Optional</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? 'Submitting…' : 'Submit Leave Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
