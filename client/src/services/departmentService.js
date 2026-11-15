import { apiClient } from './apiClient.js';
import { cachedRead, invalidateRead } from './readCache.js';

// Cached up to 50 min per user (readCache); refreshed after any department change.
export function listDepartments() {
  return cachedRead('departments', null, async () => {
    const { data } = await apiClient.get('/departments');
    return data.data;
  });
}

export async function createDepartment(payload) {
  const { data } = await apiClient.post('/departments', payload);
  invalidateRead('departments');
  return data.data;
}

export async function updateDepartment(id, payload) {
  const { data } = await apiClient.patch(`/departments/${id}`, payload);
  invalidateRead('departments');
  return data.data;
}

export async function deleteDepartment(id) {
  const { data } = await apiClient.delete(`/departments/${id}`);
  invalidateRead('departments');
  return data;
}
