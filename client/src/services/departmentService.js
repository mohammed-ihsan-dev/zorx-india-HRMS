import { apiClient } from './apiClient.js';

export async function listDepartments() {
  const { data } = await apiClient.get('/departments');
  return data.data;
}

export async function createDepartment(payload) {
  const { data } = await apiClient.post('/departments', payload);
  return data.data;
}

export async function updateDepartment(id, payload) {
  const { data } = await apiClient.patch(`/departments/${id}`, payload);
  return data.data;
}

export async function deleteDepartment(id) {
  const { data } = await apiClient.delete(`/departments/${id}`);
  return data;
}
