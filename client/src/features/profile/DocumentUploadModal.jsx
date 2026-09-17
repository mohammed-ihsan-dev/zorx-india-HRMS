import { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Select } from '../../components/Input.jsx';
import * as documentService from '../../services/documentService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const DOCUMENT_TYPES = [
  { value: 'ID_PROOF', label: 'ID Proof' },
  { value: 'ADDRESS_PROOF', label: 'Address Proof' },
  { value: 'EDUCATIONAL_CERTIFICATE', label: 'Educational Certificate' },
  { value: 'PROFILE_PHOTO', label: 'Profile Photo' },
  { value: 'OTHER', label: 'Other Document' },
];

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = {
  PROFILE_PHOTO: 2 * 1024 * 1024,
  DEFAULT: 5 * 1024 * 1024,
};

export function DocumentUploadModal({ open, onClose, onUploaded }) {
  const toast = useToast();
  const [documentType, setDocumentType] = useState('ID_PROOF');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleClose = () => {
    setDocumentType('ID_PROOF');
    setFile(null);
    setError('');
    onClose();
  };

  const handleFileChange = (e) => {
    setError('');
    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError('Unsupported file type. Please upload a PDF, JPG, or PNG file.');
      setFile(null);
      return;
    }
    const limit = MAX_SIZE_BYTES[documentType] || MAX_SIZE_BYTES.DEFAULT;
    if (selected.size > limit) {
      setError(`File size exceeds the allowed limit of ${Math.round(limit / (1024 * 1024))}MB.`);
      setFile(null);
      return;
    }
    if (documentType === 'PROFILE_PHOTO' && !selected.type.startsWith('image/')) {
      setError('Profile photo must be a JPG or PNG image.');
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please choose a file to upload.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await documentService.uploadDocument(documentType, file);
      toast.success('Document uploaded successfully.');
      handleClose();
      onUploaded();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not upload this document.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Upload Document" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}

        <Select label="Document Type" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
          {DOCUMENT_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1.5">File</label>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-8 px-4 cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors">
            <UploadCloud size={26} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">{file ? file.name : 'Click to choose a file'}</span>
            <span className="text-xs text-slate-400">
              PDF, JPG or PNG · Max {documentType === 'PROFILE_PHOTO' ? '2MB' : '5MB'}
            </span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button type="submit" loading={uploading}>
            Upload
          </Button>
        </div>
      </form>
    </Modal>
  );
}
