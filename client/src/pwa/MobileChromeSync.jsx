import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useMediaQuery, MOBILE_QUERY } from '../context/MobileShellContext.jsx';
import { isDarkMobileChrome, applyMobileChrome } from './mobileChrome.js';

/**
 * Keeps the page background and browser theme colour dark while the dark phone
 * UI is showing — by route, role and width rather than by a mounted component,
 * so it stays dark while a lazy page loads (the Suspense fallback replaces the shell).
 */
export function MobileChromeSync() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isPhone = useMediaQuery(MOBILE_QUERY);
  const dark = isDarkMobileChrome({ isPhone, pathname, role: user?.role });
  useEffect(() => applyMobileChrome(dark), [dark]);
  return null;
}
