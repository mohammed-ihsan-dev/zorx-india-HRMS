import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { employeeNavItems, employeeMobileMenuItems } from '../routes/navConfig.js';

// The five bottom-nav pages draw their own compact header.
const PRIMARY_MOBILE_ROUTES = ['/', '/attendance', '/leave', '/announcements', '/menu'];

/** Phone-only "Back + title" header for pages reached from Menu. */
export function MobileSubpageHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (PRIMARY_MOBILE_ROUTES.includes(pathname)) return null;

  const title = [...employeeNavItems, ...employeeMobileMenuItems].find((item) => !item.end && pathname.startsWith(item.to))?.label || 'ZORX INDIA';

  return (
    <header className="shrink-0 z-30 grid grid-cols-[4.5rem_1fr_4.5rem] items-center px-2 py-2.5 bg-zm-bg border-b border-zm-border">
      <button
        type="button"
        onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/menu'))}
        className="flex items-center gap-0.5 h-11 px-2 rounded-xl text-zm-green-light font-semibold text-sm"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        Back
      </button>
      <h1 className="text-base font-bold text-zm-text text-center truncate">{title}</h1>
      <span aria-hidden="true" />
    </header>
  );
}
