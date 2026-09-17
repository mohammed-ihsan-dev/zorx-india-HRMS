import { useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';
import { getAdminNavItemsForRole } from '../routes/navConfig.js';
import { useAuth } from '../hooks/useAuth.js';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  const navItems = useMemo(() => getAdminNavItemsForRole(user?.role), [user?.role]);
  const title = useMemo(() => {
    const match = navItems.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));
    return match?.label || 'ZORX INDIA';
  }, [navItems, location.pathname]);

  return (
    <div className="h-screen w-full flex overflow-hidden bg-slate-50">
      <Sidebar items={navItems} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} title={title} profilePath="/admin/employees" />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 w-full">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
