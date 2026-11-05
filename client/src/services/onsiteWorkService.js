import { apiClient } from './apiClient.js';

// Employee (Muhammed Rifan) — identity always comes from the session on the server.
export async function createOnsite(payload) {
  const { data } = await apiClient.post('/onsite-work', payload);
  return data.data;
}

export async function getMyOnsite() {
  const { data } = await apiClient.get('/onsite-work/my');
  return data.data;
}

export async function updateMyOnsite(id, payload) {
  const { data } = await apiClient.patch(`/onsite-work/my/${id}`, payload);
  return data.data;
}

export async function cancelMyOnsite(id) {
  const { data } = await apiClient.patch(`/onsite-work/my/${id}/cancel`);
  return data.data;
}

// Reviewers (Super Admins / ONSITE_WORK_REVIEW).
export async function listOnsite(params = {}) {
  const { data } = await apiClient.get('/onsite-work', { params });
  return data; // { data, meta: { total, page, pages, summary } }
}

export async function approveOnsite(id, comment = '') {
  const { data } = await apiClient.patch(`/onsite-work/${id}/approve`, { comment });
  return data.data;
}

export async function rejectOnsite(id, comment) {
  const { data } = await apiClient.patch(`/onsite-work/${id}/reject`, { comment });
  return data.data;
}
