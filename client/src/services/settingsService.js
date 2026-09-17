import { apiClient } from './apiClient.js';

export async function getOfficeSettings() {
  const { data } = await apiClient.get('/settings/office');
  return data.data;
}

export async function updateOfficeSettings(payload) {
  const { data } = await apiClient.patch('/settings/office', payload);
  return data.data;
}
