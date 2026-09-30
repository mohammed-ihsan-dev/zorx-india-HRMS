import { apiClient } from './apiClient.js';

export async function getAdminDashboard(range = 'all') {
  const { data } = await apiClient.get('/dashboard/admin', { params: { range } });
  return data.data;
}
