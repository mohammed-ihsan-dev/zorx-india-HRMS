import { useEffect, useState } from 'react';

const TIME_ZONE = 'Asia/Kolkata';

function getPart(parts, type) {
  return parts.find((p) => p.type === type)?.value || '';
}

function formatIst(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);

  const monthLong = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'long' }).format(date);

  const hour = getPart(parts, 'hour');
  const minute = getPart(parts, 'minute');
  const dayPeriod = getPart(parts, 'dayPeriod').toUpperCase();
  const day = getPart(parts, 'day');
  const monthShort = getPart(parts, 'month').toUpperCase();
  const year = getPart(parts, 'year');
  const weekday = getPart(parts, 'weekday');

  return {
    time: `${hour}:${minute} ${dayPeriod}`,
    dateShort: `${day} ${monthShort} ${year}`,
    dateLong: `${weekday}, ${day} ${monthLong} ${year}`,
    hour24: Number(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', hour12: false }).format(date)),
  };
}

/** Live IST clock — recalculates every second from the actual system time. Never hard-coded. */
export function useLiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return formatIst(now);
}
