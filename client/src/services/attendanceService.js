import { apiClient } from './apiClient.js';

export async function checkIn(coords) {
  const { data } = await apiClient.post('/attendance/check-in', coords);
  return data.data;
}

export async function checkOut(coords) {
  const { data } = await apiClient.post('/attendance/check-out', coords);
  return data.data;
}

export async function startBreak(type) {
  const { data } = await apiClient.post('/attendance/break/start', { type });
  return data.data;
}

export async function endBreak() {
  const { data } = await apiClient.post('/attendance/break/end');
  return data.data;
}

export async function getMyAttendanceToday() {
  const { data } = await apiClient.get('/attendance/me/today');
  return data.data;
}

export async function getMyAttendanceHistory(params = {}) {
  const { data } = await apiClient.get('/attendance/me', { params });
  return data;
}

export async function listAttendance(params = {}) {
  const { data } = await apiClient.get('/attendance', { params });
  return data;
}

export async function getEmployeeAttendance(employeeId) {
  const { data } = await apiClient.get(`/attendance/${employeeId}`);
  return data.data;
}
