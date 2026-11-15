import { apiClient } from './apiClient.js';
import { cachedRead, invalidateRead } from './readCache.js';

// Published feed: cached up to 50 min per user (readCache); refreshed on any announcement change.
export function listAnnouncements() {
  return cachedRead('announcements', null, async () => {
    const { data } = await apiClient.get('/announcements');
    return data.data;
  });
}

export async function listAllAnnouncements() {
  const { data } = await apiClient.get('/announcements/all');
  return data.data;
}

export async function createAnnouncement(payload) {
  const { data } = await apiClient.post('/announcements', payload);
  invalidateRead('announcements');
  return data.data;
}

export async function updateAnnouncement(id, payload) {
  const { data } = await apiClient.patch(`/announcements/${id}`, payload);
  invalidateRead('announcements');
  return data.data;
}

export async function deleteAnnouncement(id) {
  const { data } = await apiClient.delete(`/announcements/${id}`);
  invalidateRead('announcements');
  return data;
}
