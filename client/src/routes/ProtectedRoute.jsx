import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { SessionShell } from '../components/SessionShell.jsx';
import { Button } from '../components/Button.jsx';

export function ProtectedRoute() {
  const { user, loading, connecting, authError, retryAuth } = useAuth();
  const location = useLocation();

  if (loading) return <SessionShell connecting={connecting} />;
  if (authError) {
    return (
      <div className="zm-loading-surface min-h-screen flex flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-base font-semibold text-slate-800">Couldn&apos;t reach ZORX INDIA right now.</p>
        <p className="text-sm text-slate-500">
          You&apos;re still signed in. {typeof navigator !== 'undefined' && navigator.onLine === false ? 'You appear to be offline — this retries by itself when you reconnect.' : 'The server may still be starting. Please try again.'}
        </p>
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
