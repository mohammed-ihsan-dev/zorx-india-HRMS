import { apiClient } from './apiClient.js';

async function fetchReport(path, params) {
  const { data } = await apiClient.get(path, { params });
  return data.data;
}

export const getAttendanceReport = (params) => fetchReport('/reports/attendance', params);
export const getLeaveReport = (params) => fetchReport('/reports/leave', params);
export const getEmployeeReport = (params) => fetchReport('/reports/employees', params);
export const getTaskReport = (params) => fetchReport('/reports/tasks', params);

export function downloadReportCsv(path, params = {}) {
  const token = localStorage.getItem('zorx_token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const query = new URLSearchParams({ ...params, format: 'csv' }).toString();
  const url = `${API_URL}${path}?${query}`;

  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => res.blob())
    .then((blob) => {
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `${path.split('/').pop()}-report.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
}
