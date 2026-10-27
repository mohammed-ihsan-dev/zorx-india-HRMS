import { apiClient } from './apiClient.js';

export async function uploadDocument(documentType, file) {
  const formData = new FormData();
  formData.append('documentType', documentType);
  formData.append('file', file);
  const { data } = await apiClient.post('/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function listMyDocuments() {
  const { data } = await apiClient.get('/documents/me');
  return data.data;
}

/** Fetches the document as an authenticated blob and opens it in a new tab. */
export async function openDocument(id) {
  const token = localStorage.getItem('zorx_token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const res = await fetch(`${API_URL}/documents/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Unable to open this document.');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

export async function listAllDocuments(params = {}) {
  const { data } = await apiClient.get('/documents/admin/all', { params });
  return data;
}

export async function approveDocument(id) {
  const { data } = await apiClient.patch(`/documents/${id}/approve`);
  return data.data;
}

export async function rejectDocument(id, reason = '') {
  const { data } = await apiClient.patch(`/documents/${id}/reject`, { reason });
  return data.data;
}

// ---- Payslips (PAYSLIP documents; downloads use the same authenticated route) ----

export async function listMyPayslips() {
  const { data } = await apiClient.get('/documents/payslips/me');
  return data.data;
}

export async function listPayslips(params = {}) {
  const { data } = await apiClient.get('/documents/payslips', { params });
  return data.data;
}

export async function uploadPayslip({ employeeId, period, file, replace = false }) {
  const formData = new FormData();
  formData.append('employeeId', employeeId);
  formData.append('period', period);
  if (replace) formData.append('replace', 'true');
  formData.append('file', file);
  const { data } = await apiClient.post('/documents/payslips', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

async function fetchDocumentBlob(id) {
  const token = localStorage.getItem('zorx_token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const res = await fetch(`${API_URL}/documents/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Unable to open this document.');
  return res.blob();
}

/**
 * Opens the PDF in a new tab. The tab is opened synchronously (inside the click)
 * and filled once the authenticated download finishes, so mobile browsers don't
 * block it as a pop-up.
 */
export async function previewDocument(id) {
  const win = window.open('', '_blank');
  try {
    const url = window.URL.createObjectURL(await fetchDocumentBlob(id));
    if (win) win.location.href = url;
    else window.location.assign(url);
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch (err) {
    win?.close();
    throw err;
  }
}

/** Saves the document to the device under `fileName`. */
export async function downloadDocument(id, fileName) {
  const url = window.URL.createObjectURL(await fetchDocumentBlob(id));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}
