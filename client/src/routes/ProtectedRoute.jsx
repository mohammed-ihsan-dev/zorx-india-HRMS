import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Loader } from '../components/Loader.jsx';
import { Button } from '../components/Button.jsx';

export function ProtectedRoute() {
  const { user, loading, authError, retryAuth } = useAuth();
  const location = useLocation();

  if (loading) return <Loader fullScreen label="Loading ZORX INDIA…" />;
  if (authError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-base font-semibold text-slate-800">Couldn&apos;t reach ZORX INDIA right now.</p>
        <p className="text-sm text-slate-500">You&apos;re still signed in. Check your connection and try again.</p>
        <Button onClick={retryAuth}>Try again</Button>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (!user.mustChangePassword && location.pathname === '/change-password') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
