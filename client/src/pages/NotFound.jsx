import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';

export function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <p className="text-5xl font-extrabold text-brand-800">404</p>
      <h1 className="text-lg font-semibold text-slate-900 mt-2">Page not found</h1>
      <p className="text-sm text-slate-500 mt-1.5">The page you are looking for does not exist.</p>
      <Link to="/" className="mt-6">
        <Button>Go to Dashboard</Button>
      </Link>
    </div>
  );
}
