import { apiClient } from './apiClient.js';

export async function listClients(status) {
  const res = await apiClient.get('/clients', { params: { status } });
  return res.data?.data || [];
}

export async function createClient(data) {
  const res = await apiClient.post('/clients', data);
  return res.data?.data || res.data;
}
