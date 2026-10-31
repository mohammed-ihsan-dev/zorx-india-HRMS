import { apiClient } from './apiClient.js';

export async function createWfh(payload) {
  const { data } = await apiClient.post('/work-from-home', payload);
  return data.data;
}

export async function getMyWfh() {
  const { data } = await apiClient.get('/work-from-home/my');
  return data.data;
}

// Shared while in flight only (dashboard hook + WFH banner ask together); never cached.
let todayInFlight = null;
export function getMyWfhToday() {
  if (!todayInFlight) {
    todayInFlight = apiClient
      .get('/work-from-home/my/today')
      .then(({ data }) => data.data)
      .finally(() => {
        todayInFlight = null;
      });
  }
  return todayInFlight;
}

export async function listWfh(params = {}) {
  const { data } = await apiClient.get('/work-from-home', { params });
  return data;
}

export async function getWfhSummary() {
  const { data } = await apiClient.get('/work-from-home/summary');
  return data.data;
}

export async function approveWfh(id, reviewNote = '') {
  const { data } = await apiClient.patch(`/work-from-home/${id}/approve`, { reviewNote });
  return data.data;
}

export async function rejectWfh(id, reviewNote = '') {
  const { data } = await apiClient.patch(`/work-from-home/${id}/reject`, { reviewNote });
  return data.data;
}
