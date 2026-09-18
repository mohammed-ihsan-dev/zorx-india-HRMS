import { apiClient } from './apiClient.js';

export async function listEmployees(params = {}) {
  const { data } = await apiClient.get('/employees', { params });
  return data;
}

export async function getEmployee(id) {
  const { data } = await apiClient.get(`/employees/${id}`);
  return data.data;
}

export async function createEmployee(payload) {
  const { data } = await apiClient.post('/employees', payload);
  return data.data;
}

export async function updateEmployee(id, payload) {
  const { data } = await apiClient.patch(`/employees/${id}`, payload);
  return data.data;
}

export async function updateEmployeeStatus(id, status) {
  const { data } = await apiClient.patch(`/employees/${id}/status`, { status });
  return data.data;
}

export async function approveUserAccount(id) {
  const { data } = await apiClient.patch(`/employees/${id}/approve-account`);
  return data.data;
}

export async function rejectUserAccount(id) {
  const { data } = await apiClient.patch(`/employees/${id}/reject-account`);
  return data.data;
}

export async function uploadProfilePicture(id, file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post(`/employees/${id}/profile-picture`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function getMyProfile() {
  const { data } = await apiClient.get('/employees/me/profile');
  return data.data;
}

export async function updateMyProfile(payload) {
  const { data } = await apiClient.patch('/employees/me/profile', payload);
  return data.data;
}
