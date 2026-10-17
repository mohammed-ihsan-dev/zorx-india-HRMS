import { apiClient } from './apiClient.js';

export async function getOfficeSettings() {
  const { data } = await apiClient.get('/settings/office');
  return data.data;
}

export async function updateOfficeSettings(payload) {
  const { data } = await apiClient.patch('/settings/office', payload);
  return data.data;
}

export async function getAttendanceNetworkDiagnostics() {
  const { data } = await apiClient.get('/settings/attendance-network/diagnostics');
  return data.data;
}

export async function testEmailDelivery() {
  const { data } = await apiClient.post('/settings/mail/test');
  return data.data;
}
