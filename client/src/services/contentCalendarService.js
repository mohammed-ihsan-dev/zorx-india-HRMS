import { apiClient } from './apiClient.js';

export async function listContentCalendarItems(params = {}) {
  const { data } = await apiClient.get('/content-calendar', { params });
  return data;
}

export async function getAssignableEmployees() {
  const { data } = await apiClient.get('/content-calendar/employees');
  return data.data;
}

export async function createContentCalendarItem(payload) {
  const { data } = await apiClient.post('/content-calendar', payload);
  return data.data;
}

export async function updateContentCalendarItem(id, payload) {
  const { data } = await apiClient.patch(`/content-calendar/${id}`, payload);
  return data.data;
}

export async function deleteContentCalendarItem(id) {
  const { data } = await apiClient.delete(`/content-calendar/${id}`);
  return data;
}
