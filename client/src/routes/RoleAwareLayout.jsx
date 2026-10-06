import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EmployeeLayout } from '../layouts/EmployeeLayout.jsx';
import { AdminLayout } from '../layouts/AdminLayout.jsx';
import { ROLES, BACK_OFFICE_ROLES } from '../utils/constants.js';

// Employee paths whose page is mounted identically under /admin.
const ADMIN_EQUIVALENT_PATHS = {
  '/': '/admin',
  '/profile': '/admin/profile',
  '/content-calendar': '/admin/content-calendar',
};

/**
 * Layout for the non-/admin route tree, chosen from the authenticated user's
 * role — never from the URL. Back-office users who arrive on an employee path
 * (PWA start_url "/", notification links, "home" links) stay in the Admin
 * layout; their own-request pages (Leave, WFH, Notifications…) still work.
 * Rendered inside ProtectedRoute, so `user` is always resolved here.
 */
export function RoleAwareLayout() {
  const { user } = useAuth();
  const location = useLocation();

  if (!Object.values(ROLES).includes(user.role)) {
    return <Navigate to="/not-authorized" replace />;
  }
  if (!BACK_OFFICE_ROLES.includes(user.role)) {
    return <EmployeeLayout />;
  }

  const adminPath = ADMIN_EQUIVALENT_PATHS[location.pathname];
  if (adminPath) {
    return <Navigate to={`${adminPath}${location.search}`} replace />;
  }
  return <AdminLayout />;
}
