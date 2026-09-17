import { apiClient } from './apiClient.js';

export async function createEditRequest(payload) {
  const { data } = await apiClient.post('/edit-requests', payload);
  return data.data;
}

export async function getMyEditRequests() {
  const { data } = await apiClient.get('/edit-requests/me');
  return data.data;
}

export async function cancelEditRequest(id) {
  const { data } = await apiClient.patch(`/edit-requests/${id}/cancel`);
  return data.data;
}

export async function listEditRequests(params = {}) {
  const { data } = await apiClient.get('/edit-requests', { params });
  return data;
}

export async function approveEditRequest(id, reviewComment = '') {
  const { data } = await apiClient.patch(`/edit-requests/${id}/approve`, { reviewComment });
  return data.data;
}

export async function rejectEditRequest(id, reviewComment = '') {
  const { data } = await apiClient.patch(`/edit-requests/${id}/reject`, { reviewComment });
  return data.data;
}
