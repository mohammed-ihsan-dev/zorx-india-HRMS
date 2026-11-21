import axios from 'axios';
import { beginSave, endSave } from '../pwa/updateGuard.js';
import { ensureAccessToken, renewAccessToken, clearSession } from './session.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Generous enough for a sleeping server to wake (Render Free ≈ 30 s), short enough
// that nothing spins forever. Reads are retried once on a network error or a
// temporary server error; changes (POST/PATCH/DELETE) are never retried
// automatically — the caller checks the server state instead (attendance).
export const REQUEST_TIMEOUT_MS = 45_000;
const GET_RETRY_DELAY_MS = 1_500;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

apiClient.interceptors.request.use(async (config) => {
  // Requests that change data hold off automatic app updates until they finish.
  if ((config.method || 'get').toLowerCase() !== 'get' && !config.zmSave) {
    config.zmSave = true;
    beginSave();
  }
  const token = await ensureAccessToken().catch(() => null);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function sessionOver() {
  clearSession();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login?expired=1';
  }
}

apiClient.interceptors.response.use(
  (response) => {
    if (response.config?.zmSave) endSave();
    return response;
  },
  async (error) => {
    const config = error.config || {};
    const status = error.response?.status;
    const code = error.response?.data?.code;

    // The access token expired (or was missing): renew it once and repeat the call.
    // Safe for any method — the server refused before doing anything.
    if (status === 401 && !config.zmRenewed && (code === 'TOKEN_EXPIRED' || code === 'TOKEN_MISSING')) {
      config.zmRenewed = true;
      const token = await renewAccessToken().catch(() => undefined);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        return apiClient(config);
      }
      if (token === null) {
        if (config.zmSave) endSave();
        sessionOver();
        return Promise.reject(error);
      }
      // undefined: the server could not be reached to renew — report the original error.
    } else if (status === 401) {
      if (config.zmSave) endSave();
      sessionOver();
      return Promise.reject(error);
    }

    // Reads only: one automatic retry after a network error / timeout / 502-504.
    const isRead = (config.method || 'get').toLowerCase() === 'get';
    if (isRead && !config.zmRetried && (!error.response || RETRYABLE_STATUS.has(status)) && !axios.isCancel(error)) {
      config.zmRetried = true;
      await new Promise((r) => setTimeout(r, GET_RETRY_DELAY_MS));
      return apiClient(config);
    }

    if (config.zmSave) endSave();
    return Promise.reject(error);
  }
);

/** Same token the API client uses, for fetch() downloads (blobs, exports). */
export async function authorizedFetch(url, init = {}) {
  const token = await ensureAccessToken().catch(() => null);
  const headers = { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(url, { ...init, headers });
}

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data;
  if (data?.details?.fieldErrors) {
    const fieldMessages = Object.entries(data.details.fieldErrors)
      .flatMap(([field, errors]) => {
        const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
        const errList = Array.isArray(errors) ? errors : [errors];
        return errList.map((err) => `${fieldName}: ${err}`);
      })
      .filter(Boolean);
    if (fieldMessages.length > 0) {
      return fieldMessages.join('. ');
    }
  }
  if (data?.details?.formErrors && Array.isArray(data.details.formErrors) && data.details.formErrors.length > 0) {
    return data.details.formErrors.join('. ');
  }
  return data?.message || fallback;
}
