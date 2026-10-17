import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ArrowLeft, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { Loader } from '../../components/Loader.jsx';
import { AuthCardLayout } from './AuthCardLayout.jsx';
import * as authService from '../../services/authService.js';
import { getErrorMessage } from '../../services/apiClient.js';

// Pure read (safe if React runs the initializer twice); the URL is cleaned up in an effect.
const readTokenFromUrl = () => new URLSearchParams(window.location.search).get('token') || '';

export function ResetPassword() {
  const [token] = useState(readTokenFromUrl);
  const [phase, setPhase] = useState(token ? 'checking' : 'invalid'); // checking | form | invalid | done
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Strip the one-time token from the address bar so it isn't kept in history
  // or leaked via the Referer header.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (!token) return;
    authService
      .verifyResetToken(token)
      .then(() => setPhase('form'))
      .catch(() => setPhase('invalid'));
  }, [token]);

  const tooShort = form.newPassword.length > 0 && form.newPassword.length < 8;
  const mismatch = form.confirmPassword.length > 0 && form.confirmPassword !== form.newPassword;
  const canSubmit = form.newPassword.length >= 8 && form.confirmPassword === form.newPassword && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      await authService.resetPassword({ token, ...form });
      setPhase('done');
    } catch (err) {
      const message = getErrorMessage(err, 'Could not reset your password. Please try again.');
      if (/invalid or has expired/i.test(message)) setPhase('invalid');
      else setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
      aria-label={showPassword ? 'Hide password' : 'Show password'}
    >
      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  );

  return (
    <AuthCardLayout title="Reset Password" subtitle={phase === 'form' ? 'Choose a new password for your account.' : undefined}>
      {phase === 'checking' && <Loader label="Checking your reset link…" />}

      {phase === 'invalid' && (
        <div className="space-y-6">
          <div role="alert" className="flex items-start gap-3 text-sm font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle size={20} className="shrink-0 text-amber-600 mt-0.5" />
            <span>This reset link is invalid or has expired. Reset links work once and expire after 30 minutes.</span>
          </div>
          <Link to="/forgot-password" className="block">
            <Button className="w-full">Request a New Link</Button>
          </Link>
        </div>
      )}

      {phase === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}
          <Input
            id="reset-new-password"
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            hint={tooShort ? 'Password must be at least 8 characters.' : 'At least 8 characters.'}
            rightElement={toggle}
            required
          />
          <Input
            id="reset-confirm-password"
            label="Confirm New Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            error={mismatch ? 'Passwords do not match.' : undefined}
            required
          />
          <Button type="submit" size="lg" icon={KeyRound} loading={submitting} disabled={!canSubmit} className="w-full text-base sm:text-lg py-3.5 min-h-[50px] font-bold shadow-md">
            Reset Password
          </Button>
        </form>
      )}

      {phase === 'done' && (
        <div className="space-y-6">
          <div role="status" className="flex items-start gap-3 text-sm font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-600 mt-0.5" />
            <span>Your password has been reset. For your security, you've been signed out on all devices.</span>
          </div>
          <Link to="/login" className="block">
            <Button className="w-full">Sign In</Button>
          </Link>
        </div>
      )}

      {phase !== 'done' && (
        <p className="text-center text-sm text-slate-500 mt-6">
          <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 hover:underline">
            <ArrowLeft size={15} /> Back to Sign In
          </Link>
        </p>
      )}
    </AuthCardLayout>
  );
}
