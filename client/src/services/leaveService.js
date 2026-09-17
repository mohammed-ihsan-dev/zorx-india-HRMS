import { apiClient } from './apiClient.js';

export async function createLeave(payload) {
  const { data } = await apiClient.post('/leaves', payload);
  return data.data;
}

export async function getMyLeaves() {
  const { data } = await apiClient.get('/leaves/me');
  return data.data;
}

export async function cancelLeave(id) {
  const { data } = await apiClient.patch(`/leaves/${id}/cancel`);
  return data.data;
}

export async function listLeaves(params = {}) {
  const { data } = await apiClient.get('/leaves', { params });
  return data;
}

export async function approveLeave(id, reviewNote = '') {
  const { data } = await apiClient.patch(`/leaves/${id}/approve`, { reviewNote });
  return data.data;
}

export async function rejectLeave(id, reviewNote = '') {
  const { data } = await apiClient.patch(`/leaves/${id}/reject`, { reviewNote });
  return data.data;
}
