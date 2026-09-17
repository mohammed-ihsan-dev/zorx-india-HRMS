import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';
import { employeeNavItems } from '../routes/navConfig.js';

function getTitle(pathname) {
  const match = employeeNavItems.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
  return match?.label || 'ZORX INDIA';
}

export function EmployeeLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

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
    </div>
  );
}
