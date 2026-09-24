import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('zorx_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('zorx_token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1';
      }
    }
    return Promise.reject(error);
  }
);

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
