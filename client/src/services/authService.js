import { apiClient } from './apiClient.js';
import { loginRequest, logoutRequest, clearSession } from './session.js';

/** Signs in and starts a persistent session (refresh cookie + in-memory access token). */
export async function login(email, password) {
  return loginRequest(email, password);
}

export async function signup(payload) {
  const { data } = await apiClient.post('/auth/signup', payload);
  return data;
}

export async function logout() {
  await logoutRequest();
}

/** Signs this account out on every device. */
export async function logoutAll() {
  try {
    await apiClient.post('/auth/logout-all');
  } finally {
    clearSession();
  }
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
