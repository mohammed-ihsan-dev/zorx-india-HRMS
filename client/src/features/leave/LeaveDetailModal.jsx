import { FileText, Download } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import * as documentService from '../../services/documentService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';

export function LeaveDetailModal({ open, onClose, leave, onRequestCancel }) {
  if (!leave) return null;

  const canCancel = ['PENDING', 'APPROVED'].includes(leave.status);

  const handleViewDocument = async () => {
    try {
      await documentService.openDocument(leave.supportingDocumentId._id);
    } catch {
      // openDocument already surfaces a thrown error message; a silent no-op here is fine.
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Leave Details">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-brand-800">
            {formatDate(leave.startDate)}
            {leave.startDate !== leave.endDate && <> – {formatDate(leave.endDate)}</>}
          </p>
          <StatusBadge status={leave.status} />
        </div>

        <dl className="divide-y divide-slate-100">
          <div className="flex justify-between py-2.5">
            <dt className="text-sm font-semibold text-slate-500">Leave Type</dt>
            <dd className="text-base font-medium text-slate-800">{titleCase(leave.leaveType)} Leave</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-sm font-semibold text-slate-500">Duration</dt>
            <dd className="text-base font-medium text-slate-800">
              {leave.days} day{leave.days > 1 ? 's' : ''}
            </dd>
          </div>
          <div className="py-2.5">
            <dt className="text-sm font-semibold text-slate-500 mb-1">Reason</dt>
            <dd className="text-base text-slate-800">{leave.reason}</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-sm font-semibold text-slate-500">Submitted</dt>
            <dd className="text-base font-medium text-slate-800">{formatDate(leave.createdAt)}</dd>
          </div>
          {leave.reviewNote && (
            <div className="py-2.5">
              <dt className="text-sm font-semibold text-slate-500 mb-1">HR Response</dt>
              <dd className="text-base text-slate-800">{leave.reviewNote}</dd>
            </div>
          )}
        </dl>

        {leave.supportingDocumentId && (
          <button
            onClick={handleViewDocument}
            className="w-full flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-3.5 py-2.5 hover:bg-slate-50"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700 truncate">
              <FileText size={16} className="text-brand-700 shrink-0" />
              {leave.supportingDocumentId.originalFileName || 'Supporting document'}
            </span>
            <Download size={15} className="text-slate-400 shrink-0" />
          </button>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canCancel && (
            <Button variant="danger" onClick={() => onRequestCancel(leave)}>
              Cancel Leave
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
