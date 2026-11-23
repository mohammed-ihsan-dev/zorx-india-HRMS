import { apiClient, authorizedFetch } from './apiClient.js';

async function fetchReport(path, params) {
  const { data } = await apiClient.get(path, { params });
  return data.data;
}

export const getAttendanceReport = (params) => fetchReport('/reports/attendance', params);
export const getLeaveReport = (params) => fetchReport('/reports/leave', params);
export const getEmployeeReport = (params) => fetchReport('/reports/employees', params);
export const getTaskReport = (params) => fetchReport('/reports/tasks', params);

/** Reports → Leave history: one page of leave records plus meta (total, pages, period). */
export async function getLeaveHistory(params) {
  const { data } = await apiClient.get('/reports/leave', { params });
  return { rows: data.data, meta: data.meta };
}

/** Reports → Leave statistics: approved leave taken in the period (+ Sick Leave balance for one employee). */
export async function getLeaveStats(params) {
  const { data } = await apiClient.get('/reports/leave/stats', { params });
  return data.data;
}

/** Salary Report rows plus meta (month label, employee scope, total). */
export async function getSalaryReport(params) {
  const { data } = await apiClient.get('/reports/salary', { params });
  return { rows: data.data, meta: data.meta };
}

export async function downloadReportCsv(path, params = {}) {
  return downloadReportFile(path, params, 'csv');
}

/** Downloads a server-generated export (`format` = 'csv' | 'pdf'). */
export async function downloadReportFile(path, params = {}, format = 'csv') {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const cleanParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  const query = new URLSearchParams({ ...cleanParams, format }).toString();
  const url = `${API_URL}${path}?${query}`;

  const res = await authorizedFetch(url);
  if (!res.ok) {
    let message = 'Could not export this report.';
    try {
      const body = await res.json();
      message = body?.message || message;
    } catch {
      // Response wasn't JSON (e.g. a proxy/500 HTML page) — keep the fallback message.
    }
    throw new Error(message);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `${path.split('/').pop()}-report.${format}`;

  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(link.href);
}

/** One employee's attendance month as a calendar (Reports → Attendance). */
export async function getAttendanceCalendar(params) {
  const { data } = await apiClient.get('/reports/attendance-calendar', { params });
  return data.data;
}
