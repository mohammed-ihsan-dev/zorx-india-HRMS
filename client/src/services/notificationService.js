import { apiClient } from './apiClient.js';

export async function listNotifications(params = {}) {
  const { data } = await apiClient.get('/notifications', { params });
  return data;
}

export async function markAsRead(id) {
  const { data } = await apiClient.patch(`/notifications/${id}/read`);
  return data.data;
}

export async function markAllAsRead() {
  const { data } = await apiClient.patch('/notifications/read-all');
  return data;
}
