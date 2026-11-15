import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, Palmtree, House, Megaphone, Menu } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/attendance', label: 'Calendar', icon: CalendarDays },
  { to: '/leave', label: 'Leave', icon: Palmtree },
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/menu', label: 'Menu', icon: Menu },
];

// Secondary pages live under Menu, so Menu stays highlighted while on them.
// Plain Link (not NavLink): NavLink would replace aria-current with its own route match.
const MENU_CHILDREN = ['/profile', '/tasks', '/work-from-home', '/onsite-work', '/content-calendar', '/notifications', '/payslips', '/settings'];

function isActive(item, pathname, menuPath, menuChildren) {
  if (item.end) return pathname === item.to;
  if (item.to === menuPath) return pathname.startsWith(menuPath) || menuChildren.some((p) => pathname.startsWith(p));
  return pathname.startsWith(item.to);
}

/**
 * Phone-only bottom navigation. Defaults = the Employee shell (EmployeeLayout);
 * the HR / Super Admin shells (AdminLayout) pass their own role-specific items.
 */
export function MobileBottomNav({ items = NAV_ITEMS, menuPath = '/menu', menuChildren = MENU_CHILDREN }) {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 inset-x-0 z-40 bg-zm-card/95 backdrop-blur-md border-t border-zm-border rounded-t-3xl px-3 pt-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]"
    >
      <ul className="flex items-center justify-around max-w-md mx-auto">
        {items.map((item) => {
          const active = isActive(item, pathname, menuPath, menuChildren);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  active ? 'bg-zm-accent text-white shadow-lg shadow-zm-accent/30' : 'text-zm-muted hover:text-zm-text'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
