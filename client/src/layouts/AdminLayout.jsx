import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';
import { MobileBottomNav } from '../components/MobileBottomNav.jsx';
import { MobileSubpageHeader } from '../components/MobileSubpageHeader.jsx';
import { BreakReminderWatcher } from '../features/attendance/BreakReminderWatcher.jsx';
import { markAttendanceSettled } from '../features/attendance/attendanceBoot.js';
import { MobileShellProvider, useMediaQuery, MOBILE_QUERY } from '../context/MobileShellContext.jsx';
import { getAdminNavItemsForRole, employeeNavItems } from '../routes/navConfig.js';
import { ADMIN_MENU_PATH, ADMIN_PRIMARY_ROUTES, adminBottomNavFor, adminMenuChildrenFor, adminTitleItemsFor } from '../routes/adminMobileConfig.js';
import { useAuth } from '../hooks/useAuth.js';
import { ROLES } from '../utils/constants.js';
import { DiwaliWelcomeGate } from '../features/diwali/DiwaliWelcomeGate.jsx';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const isMobile = useMediaQuery(MOBILE_QUERY);

  // A Super Admin has no personal attendance, so nothing would release the
  // attendance-first hold on secondary requests (notifications…) — release it now.
  useEffect(() => {
    if (user?.role === ROLES.SUPER_ADMIN) markAttendanceSettled();
  }, [user?.role]);

  const navItems = useMemo(() => getAdminNavItemsForRole(user?.role, user?.permissions), [user?.role, user?.permissions]);
  const title = useMemo(() => {
    if (location.pathname === '/admin/profile') return 'My Profile';
    const matches = (item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to));
    // Also hosts a back-office user's own-request pages (Leave, WFH, …) — see RoleAwareLayout.
    const match = navItems.find(matches) || employeeNavItems.find((item) => item.to !== '/' && matches(item));
    return match?.label || 'ZORX INDIA';
  }, [navItems, location.pathname]);

  // Phones: the HR / Super Admin app shell — same design language as the Employee
  // phone app (dark shell, floating bottom nav), with role-specific navigation.
  // Tablet and desktop render exactly the original layout below.
  if (isMobile) {
    return (
      <MobileShellProvider active>
        <div className="zm-mobile zm-viewport-h w-full flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
          <MobileSubpageHeader primaryRoutes={ADMIN_PRIMARY_ROUTES} titleItems={adminTitleItemsFor(user)} menuPath={ADMIN_MENU_PATH} />
          <main className="flex-1 overflow-y-auto w-full px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+96px)]">
            <Outlet />
          </main>
          <MobileBottomNav items={adminBottomNavFor(user)} menuPath={ADMIN_MENU_PATH} menuChildren={adminMenuChildrenFor(user)} />
          <BreakReminderWatcher />
          <DiwaliWelcomeGate />
        </div>
      </MobileShellProvider>
    );
  }

  return (
    <div className="h-screen w-full flex overflow-hidden bg-zx-sea">
      <Sidebar items={navItems} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} title={title} profilePath="/admin/profile" />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 w-full">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      <BreakReminderWatcher />
      <DiwaliWelcomeGate />
    </div>
  );
}
