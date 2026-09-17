import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Loader } from '../components/Loader.jsx';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader fullScreen label="Loading ZORX INDIA…" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (!user.mustChangePassword && location.pathname === '/change-password') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
