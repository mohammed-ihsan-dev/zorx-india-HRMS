import { apiClient } from './apiClient.js';

/** Company holidays, optionally within from/to (YYYY-MM-DD, inclusive). */
export async function listHolidays(params = {}) {
  const { data } = await apiClient.get('/holidays', { params });
  return data.data;
}

export async function createHoliday({ date, name }) {
  const { data } = await apiClient.post('/holidays', { date, name });
  return data;
}

export async function deleteHoliday(id) {
  const { data } = await apiClient.delete(`/holidays/${id}`);
  return data;
}
