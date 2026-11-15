import { apiClient } from './apiClient.js';
import { cachedRead, invalidateRead } from './readCache.js';

/** Company holidays, optionally within from/to (YYYY-MM-DD, inclusive). */
// Cached up to 50 min per user and date range (readCache); refreshed after any holiday change.
export function listHolidays(params = {}) {
  return cachedRead('holidays', params, async () => {
    const { data } = await apiClient.get('/holidays', { params });
    return data.data;
  });
}

export async function createHoliday({ date, name }) {
  const { data } = await apiClient.post('/holidays', { date, name });
  invalidateRead('holidays');
  return data;
}

export async function deleteHoliday(id) {
  const { data } = await apiClient.delete(`/holidays/${id}`);
  invalidateRead('holidays');
  return data;
}
