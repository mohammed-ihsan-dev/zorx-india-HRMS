import { User, Calendar, Clock, AlertCircle, MessageSquare, CheckCircle2, Building2, UserCheck, Edit3, Trash2, Tag } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge, PriorityBadge } from '../../components/StatusBadge.jsx';
import { formatDate } from '../../utils/formatters.js';

export function ContentCalendarDetailsModal({ open, onClose, item, canManage, onEdit, onDelete, onStatusChange }) {
  if (!item) return null;

  const assignedEmpName = item.assignedEmployee
    ? `${item.assignedEmployee.firstName || ''} ${item.assignedEmployee.lastName || ''}`.trim()
    : 'Unassigned';

  const assignedByName = item.assignedBy?.employeeId
    ? `${item.assignedBy.employeeId.firstName || ''} ${item.assignedBy.employeeId.lastName || ''}`.trim()
    : item.assignedBy?.email || 'System';

  return (
    <Modal open={open} onClose={onClose} title="Work Details" size="lg">
      <div className="space-y-6 max-h-[78vh] overflow-y-auto pr-1">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <Building2 size={14} className="text-slate-400" />
              <span>{item.client || 'Client Work'}</span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 leading-tight">{item.work}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PriorityBadge priority={item.priority} />
            <StatusBadge status={item.workStatus} />
          </div>
        </div>

        {/* 11 Mandatory Fields Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Client */}
          <div className="p-3.5 bg-white border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 size={13} className="text-brand-600" /> 1. Client
            </span>
            <p className="text-sm font-semibold text-slate-900">{item.client || '—'}</p>
          </div>

          {/* 2. Date */}
          <div className="p-3.5 bg-white border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={13} className="text-brand-600" /> 2. Date
            </span>
            <p className="text-sm font-medium text-slate-800">{formatDate(item.date)}</p>
          </div>

          {/* 3. Assigned Employee */}
          <div className="p-3.5 bg-white border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <User size={13} className="text-brand-600" /> 3. Assigned Employee
            </span>
            <p className="text-sm font-semibold text-slate-900">{assignedEmpName}</p>
            {item.assignedEmployee?.employeeCode && (
              <span className="inline-block text-xs font-mono text-slate-500">ID: {item.assignedEmployee.employeeCode}</span>
            )}
          </div>

          {/* 4. Work */}
          <div className="p-3.5 bg-white border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Tag size={13} className="text-brand-600" /> 4. Work
            </span>
            <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">{item.work}</p>
          </div>

          {/* 5. Assigned By */}
          <div className="p-3.5 bg-white border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck size={13} className="text-brand-600" /> 5. Assigned By
            </span>
            <p className="text-sm font-medium text-slate-800">{assignedByName}</p>
          </div>

          {/* 6. Deadline */}
          <div className="p-3.5 bg-white border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={13} className="text-rose-500" /> 7. Deadline
            </span>
            <p className="text-sm font-semibold text-slate-900">{formatDate(item.deadline)}</p>
          </div>

          {/* 7. Priority */}
          <div className="p-3.5 bg-white border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={13} className="text-brand-600" /> 8. Priority
            </span>
            <div>
              <PriorityBadge priority={item.priority} />
            </div>
          </div>

          {/* 8. Work Status */}
          <div className="p-3.5 bg-white border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-brand-600" /> 9. Work Status
            </span>
            <div>
              <StatusBadge status={item.workStatus} />
            </div>
          </div>
        </div>

        {/* Detailed Remarks & Feedback */}
        <div className="space-y-3 pt-1">
          {/* 6. Assignment Remark */}
          <div className="p-3.5 bg-slate-50/70 border border-slate-200/70 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={13} className="text-slate-500" /> 6. Assignment Remark
            </span>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.assignmentRemark || 'No assignment remarks provided.'}</p>
          </div>

          {/* 10. Completion Remark */}
          <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" /> 10. Completion Remark
            </span>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.completionRemark || 'No completion remarks provided.'}</p>
          </div>

          {/* 11. Client Feedback */}
          <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={13} className="text-amber-600" /> 11. Client Feedback
            </span>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.clientFeedback || 'No client feedback recorded.'}</p>
          </div>
        </div>

        {/* Quick Status Change bar for Managers */}
        {canManage && onStatusChange && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Status Update:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onStatusChange(item, 'REMAINING')}
                disabled={item.workStatus === 'REMAINING'}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  item.workStatus === 'REMAINING'
                    ? 'bg-slate-200 text-slate-600 cursor-default'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Upcoming
              </button>
              <button
                type="button"
                onClick={() => onStatusChange(item, 'ONGOING')}
                disabled={item.workStatus === 'ONGOING'}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  item.workStatus === 'ONGOING'
                    ? 'bg-blue-600 text-white shadow-sm cursor-default'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                Ongoing
              </button>
              <button
                type="button"
                onClick={() => onStatusChange(item, 'COMPLETED')}
                disabled={item.workStatus === 'COMPLETED'}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  item.workStatus === 'COMPLETED'
                    ? 'bg-emerald-600 text-white shadow-sm cursor-default'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Completed
              </button>
            </div>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <Button variant="outline" type="button" onClick={onClose}>
            Close
          </Button>

          {canManage && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                icon={Edit3}
                onClick={() => {
                  onClose();
                  onEdit(item);
                }}
              >
                Edit Work
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={() => {
                  onClose();
                  onDelete(item);
                }}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
