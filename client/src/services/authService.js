import { apiClient } from './apiClient.js';

export async function login(email, password) {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data.data;
}

export async function signup(payload) {
  const { data } = await apiClient.post('/auth/signup', payload);
  return data;
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

export async function forgotPassword(email) {
  const { data } = await apiClient.post('/auth/forgot-password', { email });
  return data;
}

export async function verifyPasswordResetOtp(email, otp) {
  const { data } = await apiClient.post('/auth/forgot-password/verify-otp', { email, otp });
  return data.data;
}

export async function resetPassword(payload) {
  const { data } = await apiClient.post('/auth/reset-password', payload);
  return data;
}
