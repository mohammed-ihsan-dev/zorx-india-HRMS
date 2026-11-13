import { apiClient } from './apiClient.js';

export async function checkIn(coords) {
  const { data } = await apiClient.post('/attendance/check-in', coords);
  return data.data;
}

export async function checkOut(coords) {
  const { data } = await apiClient.post('/attendance/check-out', coords);
  return data.data;
}

export async function resetVirtualAttendance() {
  const { data } = await apiClient.post('/attendance/virtual/reset');
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

// Components asking at the same moment (dashboard + break reminders) share one
// request while it is in flight. By default nothing is cached, so the dashboard
// (and every Check-in / Check-out decision) always gets a fresh server answer.
// Only a caller that passes `maxAgeMs` (the break-reminder watcher) may reuse an
// answer that recent — and only for the same signed-in token.
let todayInFlight = null;
let lastToday = null; // { at, token, data }
const currentToken = () => {
  try {
    return localStorage.getItem('zorx_token');
  } catch {
    return null;
  }
};
export function getMyAttendanceToday({ maxAgeMs = 0 } = {}) {
  if (maxAgeMs > 0 && lastToday && lastToday.token === currentToken() && Date.now() - lastToday.at <= maxAgeMs) {
    return Promise.resolve(lastToday.data);
  }
  if (!todayInFlight) {
    const token = currentToken();
    todayInFlight = apiClient
      .get('/attendance/me/today')
      .then(({ data }) => {
        lastToday = { at: Date.now(), token, data: data.data };
        return data.data;
      })
      .finally(() => {
        todayInFlight = null;
      });
  }
  return todayInFlight;
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

export async function getNetworkStatus() {
  const { data } = await apiClient.get('/attendance/network-status');
  return data.data;
}
