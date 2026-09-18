import { apiClient } from './apiClient.js';

async function fetchReport(path, params) {
  const { data } = await apiClient.get(path, { params });
  return data.data;
}

export const getAttendanceReport = (params) => fetchReport('/reports/attendance', params);
export const getLeaveReport = (params) => fetchReport('/reports/leave', params);
export const getEmployeeReport = (params) => fetchReport('/reports/employees', params);
export const getTaskReport = (params) => fetchReport('/reports/tasks', params);

export async function downloadReportCsv(path, params = {}) {
  const token = localStorage.getItem('zorx_token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const cleanParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  const query = new URLSearchParams({ ...cleanParams, format: 'csv' }).toString();
  const url = `${API_URL}${path}?${query}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
  const filename = match ? match[1] : `${path.split('/').pop()}-report.csv`;

  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(link.href);
}
