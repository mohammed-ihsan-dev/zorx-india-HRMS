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
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar items={employeeNavItems} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onMenuClick={() => setSidebarOpen(true)} title={getTitle(location.pathname)} profilePath="/profile" />
        <main className="flex-1 p-4 lg:p-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
