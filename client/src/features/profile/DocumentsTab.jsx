import { useEffect, useState } from 'react';
import { FileText, Upload, Eye, FolderOpen } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { DocumentUploadModal } from './DocumentUploadModal.jsx';
import * as documentService from '../../services/documentService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

function fileTypeLabel(mimeType) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/jpeg') return 'JPG';
  if (mimeType === 'image/png') return 'PNG';
  return 'FILE';
}

export function DocumentsTab() {
  const toast = useToast();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [openingId, setOpeningId] = useState(null);

  const load = () => {
    setLoading(true);
    documentService
      .listMyDocuments()
      .then(setDocuments)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = async (doc) => {
    setOpeningId(doc._id);
    try {
      await documentService.openDocument(doc._id);
    } catch (err) {
      toast.error(err.message || 'Unable to open this document.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Profile Documents"
        subtitle="Upload identity, address, and certification documents"
        action={
          <Button size="sm" icon={Upload} onClick={() => setUploadOpen(true)}>
            Upload
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No documents uploaded" description="Upload your ID proof, address proof, or certificates here." />
      ) : (
        <div className="divide-y divide-slate-100">
          {documents.map((doc) => (
            <div key={doc._id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                  <FileText size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-800 truncate">{titleCase(doc.documentType)}</p>
                  <p className="text-sm text-slate-400">
                    {fileTypeLabel(doc.mimeType)} · Uploaded {formatDate(doc.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {doc.status === 'PENDING' ? (
                  <Badge color="amber">Pending Admin Approval</Badge>
                ) : doc.status === 'APPROVED' ? (
                  <Badge color="green">Approved</Badge>
                ) : (
                  <Badge color="red">Rejected</Badge>
                )}
                <Button size="sm" variant="ghost" icon={Eye} loading={openingId === doc._id} onClick={() => handleView(doc)}>
                  View
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DocumentUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={load} />
    </Card>
  );
}
