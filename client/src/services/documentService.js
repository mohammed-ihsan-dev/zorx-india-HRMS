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
