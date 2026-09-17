import { apiClient } from './apiClient.js';

export async function login(email, password) {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data.data;
}

export async function logout() {
  await apiClient.post('/auth/logout');
}

export async function getMe() {
  const { data } = await apiClient.get('/auth/me');
  return data.data;
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await apiClient.post('/auth/change-password', { currentPassword, newPassword });
  return data;
}
