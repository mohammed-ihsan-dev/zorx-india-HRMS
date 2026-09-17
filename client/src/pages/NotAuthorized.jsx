import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';

export function NotAuthorized() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <ShieldAlert size={26} className="text-red-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
      <p className="text-sm text-slate-500 mt-1.5 max-w-sm">
        You do not have permission to view this page. Contact your Admin or HR if you believe this is a mistake.
      </p>
      <Link to="/" className="mt-6">
        <Button>Go to Dashboard</Button>
      </Link>
    </div>
  );
}
