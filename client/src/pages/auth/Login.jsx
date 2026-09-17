import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { ZorxLogo } from '../../components/ZorxLogo.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { BACK_OFFICE_ROLES } from '../../utils/constants.js';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const expired = searchParams.get('expired') === '1';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form.email.trim(), form.password);
      const isBackOffice = BACK_OFFICE_ROLES.includes(user.role);
      navigate(isBackOffice ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid email or password.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      {/* Left Branding Panel (Dark Deep Green Background) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white flex-col justify-between p-12 lg:p-16 relative overflow-hidden shadow-2xl">
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-white/5 blur-xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-24 w-80 h-80 rounded-full bg-white/5 blur-xl pointer-events-none" />

        {/* White Logo on Dark Green Background */}
        <div className="relative">
          <ZorxLogo variant="white" size="login" />
          <div className="mt-2 text-brand-200 text-sm font-semibold tracking-wider uppercase border-t border-white/10 pt-3 inline-block">
            Office Management System
          </div>
        </div>

        <div className="relative max-w-lg space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-brand-200 text-xs font-bold uppercase tracking-wider backdrop-blur-xs">
            <ShieldCheck size={16} /> Enterprise Grade Access
          </div>
          <h2 className="text-3xl xl:text-4xl font-extrabold leading-tight text-white tracking-tight">
            Attendance, leave & tasks — streamlined in one powerful workspace.
          </h2>
          <p className="text-brand-100 text-base xl:text-lg leading-relaxed pt-2">
            Location-verified check-in & check-out, real-time analytics, and automated HR management crafted for ZORX INDIA.
          </p>
        </div>

        <div className="relative pt-6 border-t border-white/10 flex items-center justify-between text-sm text-brand-300">
          <span>© {new Date().getFullYear()} ZORX INDIA. All rights reserved.</span>
          <span className="font-medium text-brand-200">v1.0.0</span>
        </div>
      </div>

      {/* Right Login Form (Light Background) */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/90 shadow-card-lg">
          <div className="flex flex-col items-center mb-8 text-center">
            {/* Official Green Logo on Light Background */}
            <ZorxLogo variant="green" size="login" className="mb-4" />
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">Welcome Back</h1>
            <p className="text-base text-slate-600 mt-1.5">Sign in to access your ZORX INDIA workspace.</p>
          </div>

          {expired && (
            <div className="mb-6 text-base font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
              Your session has expired. Please log in again.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              autoComplete="email"
              placeholder="you@zorxindia.dev"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              error={error}
              required
            />
            <Button
              type="submit"
              className="w-full text-base sm:text-lg py-3.5 min-h-[50px] font-bold shadow-md"
              size="lg"
              icon={LogIn}
              loading={submitting}
            >
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
