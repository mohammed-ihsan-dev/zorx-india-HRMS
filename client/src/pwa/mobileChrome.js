// Which pages are the dark phone app (employee shell + phone login), so the
// page itself — <html>/<body>, which iOS paints behind the status bar and in
// overscroll — and the browser chrome colour match it. Kept in sync with the
// inline boot script in index.html (it runs before React, without the user).
import { BACK_OFFICE_ROLES } from '../utils/constants.js';

export const DARK_BG = '#101418';
export const BRAND_THEME = '#1f5138';

// Pages that stay light on phones (admin area, sign-up/recovery, error pages).
const LIGHT_PREFIXES = ['/admin', '/signup', '/forgot-password', '/reset-password', '/change-password', '/not-authorized'];

/** True when this route, for this user, renders the dark phone UI. */
export function isDarkMobileChrome({ isPhone, pathname, role }) {
  if (!isPhone) return false;
  if (LIGHT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  // Back-office users get the (light) admin layout even on employee routes.
  return !(role && BACK_OFFICE_ROLES.includes(role));
}

/** Applies it: data-zm-chrome on <html> (see index.css) and the theme-color meta. */
export function applyMobileChrome(dark, doc = globalThis.document) {
  if (!doc) return;
  const root = doc.documentElement;
  if (dark) root.setAttribute('data-zm-chrome', 'dark');
  else root.removeAttribute('data-zm-chrome');
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? DARK_BG : BRAND_THEME);
}
