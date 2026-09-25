export function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', options);
}

export function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTime(value) {
  if (!value) return '—';
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function formatMinutes(totalMinutes) {
  if (totalMinutes === undefined || totalMinutes === null) return '—';
  const abs = Math.abs(Math.round(totalMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${h}h ${m}m`;
}

export function formatMeters(distance) {
  if (distance === undefined || distance === null) return '—';
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${Math.round(distance)}m`;
}

export function initials(firstName = '', lastName = '') {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/** Parses "HH:mm" (e.g. office working hours) into minutes since midnight. */
export function parseTimeToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function titleCase(value = '') {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatCountdownSeconds(totalSeconds) {
  if (totalSeconds === undefined || totalSeconds === null || isNaN(totalSeconds)) return '00:00';
  const absSec = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(absSec / 3600);
  const mins = Math.floor((absSec % 3600) / 60);
  const secs = absSec % 60;

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  if (hrs > 0) {
    const hh = String(hrs).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function isNotProvided(val) {
  if (val === undefined || val === null) return true;
  const str = String(val).trim().toLowerCase();
  return (
    str === '' ||
    str === '0' ||
    str === 'no' ||
    str === 'nil' ||
    str === 'nill' ||
    str === 'none' ||
    str === 'na' ||
    str === 'n/a' ||
    str === '—' ||
    str === '-' ||
    str === 'unassigned' ||
    str === 'null' ||
    str === 'undefined'
  );
}

export function getProfileImageUrl(url) {
  if (!url) return '';

  // Blob URLs (e.g. upload previews) or data URLs
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }

  // If it's an HTTP/HTTPS absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // In HTTPS environments, upgrade http:// to https:// to prevent mixed content blocking
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
      url = url.replace(/^http:\/\//i, 'https://');
    }
    // If it points to localhost in a production frontend, replace host with API origin
    if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && url.includes('localhost:')) {
      const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'https://api.zorxindia.online/api').origin;
      url = url.replace(/^https?:\/\/localhost:\d+/i, apiOrigin);
    }
    return url;
  }

  // If it's an uploaded image starting with /uploads/
  if (url.startsWith('/uploads/')) {
    const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'https://api.zorxindia.online/api').origin;
    return `${apiOrigin}${url}`;
  }

  // Static relative asset (e.g. /profile/shamila.png) served by frontend public folder
  return url;
}



