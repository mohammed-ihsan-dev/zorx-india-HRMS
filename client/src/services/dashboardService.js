import { apiClient } from './apiClient.js';

export async function getAdminDashboard() {
  const { data } = await apiClient.get('/dashboard/admin');
  return data.data;
}
