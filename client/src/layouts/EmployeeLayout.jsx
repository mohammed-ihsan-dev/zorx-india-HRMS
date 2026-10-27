import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';
import { MobileBottomNav } from '../components/MobileBottomNav.jsx';
import { MobileSubpageHeader } from '../components/MobileSubpageHeader.jsx';
import { BreakReminderWatcher } from '../features/attendance/BreakReminderWatcher.jsx';
import { MobileShellProvider, useMediaQuery, MOBILE_QUERY } from '../context/MobileShellContext.jsx';
import { employeeNavItems } from '../routes/navConfig.js';

function getTitle(pathname) {
  const match = employeeNavItems.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
  return match?.label || 'ZORX INDIA';
}

export function EmployeeLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isMobile = useMediaQuery(MOBILE_QUERY);

  // Phones get the compact dark-green shell with bottom navigation. Tablet and
  // desktop render exactly the original layout below.
  if (isMobile) {
    return (
      <MobileShellProvider active>
        <div className="zm-mobile zm-viewport-h w-full flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
          <MobileSubpageHeader />
          <main className="flex-1 overflow-y-auto w-full px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+96px)]">
            <Outlet />
          </main>
          <MobileBottomNav />
          <BreakReminderWatcher />
        </div>
      </MobileShellProvider>
    );
  }

  return (
    <div className="h-screen w-full flex overflow-hidden bg-slate-50">
      <Sidebar items={employeeNavItems} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} title={getTitle(location.pathname)} profilePath="/profile" />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 w-full">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      <BreakReminderWatcher />
    </div>
  );
}
