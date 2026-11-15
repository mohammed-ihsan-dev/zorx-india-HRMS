import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useMobileShell } from '../../context/MobileShellContext.jsx';

// Both lazy: the phone home never downloads the desktop dashboard (and its chart
// library), and tablet/desktop never download the phone screens.
const AdminDashboard = lazy(() => import('./Dashboard.jsx').then((m) => ({ default: m.AdminDashboard })));
const AdminMobileHome = lazy(() => import('../../features/adminMobile/AdminMobileHome.jsx').then((m) => ({ default: m.AdminMobileHome })));

const Fallback = () => <div className="h-56 rounded-3xl bg-zm-card animate-pulse max-w-md mx-auto" />;

/** /admin — phones get the role's mobile home (HR or Super Admin); tablet/desktop the existing dashboard, unchanged. */
export function AdminHome() {
  const mobile = useMobileShell();
  if (!mobile) return <AdminDashboard />;
  return (
    <Suspense fallback={<Fallback />}>
      <AdminMobileHome />
    </Suspense>
  );
}

/** /admin/overview — the full analytics dashboard, reached from the phone's Overview tab. */
export function AdminOverview() {
  const mobile = useMobileShell();
  if (!mobile) return <Navigate to="/admin" replace />;
  return <AdminDashboard />;
}
