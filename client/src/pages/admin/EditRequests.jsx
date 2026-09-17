import { useEffect, useState } from 'react';
import { FileEdit, Check, X, FileText, Eye } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Select, Textarea } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Badge } from '../../components/Badge.jsx';
import * as editRequestService from '../../services/editRequestService.js';
import * as documentService from '../../services/documentService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function EditRequests() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('edits'); // 'edits' | 'documents'

  // Edit Requests State
  const [requests, setRequests] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState(null); // { request, action }
  const [reviewComment, setReviewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Document Approvals State
  const [documents, setDocuments] = useState([]);
  const [docMeta, setDocMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [docStatus, setDocStatus] = useState('PENDING');
  const [docPage, setDocPage] = useState(1);
  const [docLoading, setDocLoading] = useState(false);
  const [docActionTarget, setDocActionTarget] = useState(null); // { doc }
  const [docReason, setDocReason] = useState('');
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [openingDocId, setOpeningDocId] = useState(null);

  const loadRequests = () => {
    setLoading(true);
    editRequestService
      .listEditRequests({ status: status || undefined, page })
      .then((res) => {
        setRequests(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  const loadDocuments = () => {
    setDocLoading(true);
    documentService
      .listAllDocuments({ status: docStatus || undefined, page: docPage })
      .then((res) => {
        setDocuments(res.data);
        setDocMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setDocLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'edits') loadRequests();
    else loadDocuments();
  }, [activeTab, status, page, docStatus, docPage]);

  // Edit Request Handlers
  const openAction = (request, action) => {
    setActionTarget({ request, action });
    setReviewComment('');
  };

  const handleSubmitAction = async () => {
    setSubmitting(true);
    try {
      if (actionTarget.action === 'approve') {
        await editRequestService.approveEditRequest(actionTarget.request._id, reviewComment);
        toast.success('Edit request approved and applied.');
      } else {
        await editRequestService.rejectEditRequest(actionTarget.request._id, reviewComment);
        toast.success('Edit request rejected.');
      }
      setActionTarget(null);
      loadRequests();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Document Approval Handlers
  const handleApproveDocument = async (doc) => {
    try {
      await documentService.approveDocument(doc._id);
      toast.success('Profile document approved.');
      loadDocuments();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to approve document.'));
    }
  };

  const handleRejectDocumentSubmit = async () => {
    if (!docActionTarget) return;
    setDocSubmitting(true);
    try {
      await documentService.rejectDocument(docActionTarget.doc._id, docReason);
      toast.success('Profile document rejected.');
      setDocActionTarget(null);
      loadDocuments();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reject document.'));
    } finally {
      setDocSubmitting(false);
    }
  };

  const handleViewDoc = async (doc) => {
    setOpeningDocId(doc._id);
    try {
      await documentService.openDocument(doc._id);
    } catch (err) {
      toast.error(err.message || 'Unable to view file.');
    } finally {
      setOpeningDocId(null);
    }
  };

  const editColumns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">
            {r.employeeId?.firstName} {r.employeeId?.lastName}
          </p>
          <p className="text-xs text-slate-400">{r.employeeId?.employeeCode}</p>
        </div>
      ),
    },
    { key: 'field', header: 'Request Type', render: (r) => titleCase(r.field) },
    { key: 'currentValue', header: 'Current Value', render: (r) => <span className="max-w-[160px] truncate block">{r.currentValue || '—'}</span> },
    { key: 'requestedValue', header: 'Requested Value', render: (r) => <span className="max-w-[160px] truncate block">{r.requestedValue}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="max-w-[180px] truncate block">{r.reason}</span> },
    { key: 'createdAt', header: 'Submitted', render: (r) => formatDate(r.createdAt) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        r.status === 'PENDING' ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon={Check} onClick={() => openAction(r, 'approve')}>
              Approve
            </Button>
            <Button size="sm" variant="outline" icon={X} onClick={() => openAction(r, 'reject')}>
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  const docColumns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">
            {r.employeeId?.firstName} {r.employeeId?.lastName}
          </p>
          <p className="text-xs text-slate-400">{r.employeeId?.employeeCode}</p>
        </div>
      ),
    },
    { key: 'documentType', header: 'Document Type', render: (r) => <span className="font-semibold text-slate-800">{titleCase(r.documentType)}</span> },
    { key: 'originalFileName', header: 'File Name', render: (r) => <span className="max-w-[180px] truncate block font-mono text-xs">{r.originalFileName}</span> },
    { key: 'createdAt', header: 'Uploaded Date', render: (r) => formatDate(r.createdAt) },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.status === 'PENDING' ? (
          <Badge color="amber">Pending Approval</Badge>
        ) : r.status === 'APPROVED' ? (
          <Badge color="green">Approved</Badge>
        ) : (
          <Badge color="red">Rejected</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={Eye} loading={openingDocId === r._id} onClick={() => handleViewDoc(r)}>
            View
          </Button>
          {r.status === 'PENDING' && (
            <>
              <Button size="sm" variant="secondary" icon={Check} onClick={() => handleApproveDocument(r)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" icon={X} onClick={() => { setDocActionTarget({ doc: r }); setDocReason(''); }}>
                Reject
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card padded={false} className="p-5">
      {/* Tab Switcher Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-4 gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('edits')}
            className={`px-4 py-2 rounded-xl text-sm font-extrabold transition-all ${
              activeTab === 'edits'
                ? 'bg-brand-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Profile Edit Requests
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-2 rounded-xl text-sm font-extrabold transition-all flex items-center gap-2 ${
              activeTab === 'documents'
                ? 'bg-brand-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText size={16} /> Document Approvals
          </button>
        </div>

        {activeTab === 'edits' ? (
          <Select
            className="w-44"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        ) : (
          <Select
            className="w-44"
            value={docStatus}
            onChange={(e) => {
              setDocPage(1);
              setDocStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        )}
      </div>

      {activeTab === 'edits' ? (
        <>
          <Table columns={editColumns} data={requests} loading={loading} emptyState={<EmptyState icon={FileEdit} title="No edit requests" />} />
          <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />
        </>
      ) : (
        <>
          <Table columns={docColumns} data={documents} loading={docLoading} emptyState={<EmptyState icon={FileText} title="No documents found" description="Profile documents uploaded by employees awaiting HR verification." />} />
          <Pagination page={docMeta.page} pages={docMeta.pages} total={docMeta.total} onPageChange={setDocPage} />
        </>
      )}

      {/* Edit Request Action Modal */}
      <Modal
        open={Boolean(actionTarget)}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.action === 'approve' ? 'Approve edit request?' : 'Reject edit request?'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setActionTarget(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant={actionTarget?.action === 'approve' ? 'primary' : 'danger'}
              onClick={handleSubmitAction}
              loading={submitting}
            >
              {actionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-4">
          {actionTarget?.action === 'approve'
            ? `This will update ${actionTarget?.request.employeeId?.firstName}'s ${titleCase(actionTarget?.request.field || '')} where possible and notify them.`
            : `This will reject ${actionTarget?.request.employeeId?.firstName}'s request and notify them.`}
        </p>
        <Textarea
          label={actionTarget?.action === 'approve' ? 'Comment (optional)' : 'Rejection Reason'}
          rows={3}
          value={reviewComment}
          onChange={(e) => setReviewComment(e.target.value)}
        />
      </Modal>

      {/* Document Rejection Modal */}
      <Modal
        open={Boolean(docActionTarget)}
        onClose={() => setDocActionTarget(null)}
        title="Reject Profile Document?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDocActionTarget(null)} disabled={docSubmitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRejectDocumentSubmit} loading={docSubmitting}>
              Reject Document
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-4">
          Provide a reason for rejecting {docActionTarget?.doc?.employeeId?.firstName}&apos;s {titleCase(docActionTarget?.doc?.documentType || '')} document.
        </p>
        <Textarea
          label="Rejection Reason"
          rows={3}
          value={docReason}
          onChange={(e) => setDocReason(e.target.value)}
          placeholder="e.g. Image is blurry or expired ID proof."
        />
      </Modal>
    </Card>
  );
}
