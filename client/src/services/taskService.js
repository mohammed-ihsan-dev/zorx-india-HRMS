import { apiClient } from './apiClient.js';

export async function getMyTasks(params = {}) {
  const { data } = await apiClient.get('/tasks/me', { params });
  return data.data;
}

export async function listTasks(params = {}) {
  const { data } = await apiClient.get('/tasks', { params });
  return data;
}

export async function getTask(id) {
  const { data } = await apiClient.get(`/tasks/${id}`);
  return data.data;
}

export async function createTask(payload) {
  const { data } = await apiClient.post('/tasks', payload);
  return data.data;
}

export async function updateTask(id, payload) {
  const { data } = await apiClient.patch(`/tasks/${id}`, payload);
  return data.data;
}

export async function updateTaskStatus(id, status) {
  const { data } = await apiClient.patch(`/tasks/${id}/status`, { status });
  return data.data;
}
