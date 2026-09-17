import { apiClient } from './apiClient.js';

export async function listAnnouncements() {
  const { data } = await apiClient.get('/announcements');
  return data.data;
}

export async function listAllAnnouncements() {
  const { data } = await apiClient.get('/announcements/all');
  return data.data;
}

export async function createAnnouncement(payload) {
  const { data } = await apiClient.post('/announcements', payload);
  return data.data;
}

export async function updateAnnouncement(id, payload) {
  const { data } = await apiClient.patch(`/announcements/${id}`, payload);
  return data.data;
}

export async function deleteAnnouncement(id) {
  const { data } = await apiClient.delete(`/announcements/${id}`);
  return data;
}
