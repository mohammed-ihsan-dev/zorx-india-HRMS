import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { ZorxLogo } from '../../components/ZorxLogo.jsx';
import * as authService from '../../services/authService.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const setField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters.';
    if (form.confirmPassword !== form.password) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      await authService.signup(form);
      setDone(true);
    } catch (err) {
      setErrors({ form: getErrorMessage(err, 'Unable to create account.') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white flex-col justify-between p-12 lg:p-16 relative overflow-hidden shadow-2xl">
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-white/5 blur-xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-24 w-80 h-80 rounded-full bg-white/5 blur-xl pointer-events-none" />

        <div className="relative">
          <ZorxLogo variant="white" size="login" />
          <div className="mt-2 text-brand-200 text-sm font-semibold tracking-wider uppercase border-t border-white/10 pt-3 inline-block">
            Office Management System
          </div>
        </div>

        <div className="relative max-w-lg space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-brand-200 text-xs font-bold uppercase tracking-wider backdrop-blur-xs">
            <ShieldCheck size={16} /> Admin-Reviewed Access
          </div>
          <h2 className="text-3xl xl:text-4xl font-extrabold leading-tight text-white tracking-tight">
            Join your team on ZORX INDIA&apos;s HRMS.
          </h2>
          <p className="text-brand-100 text-base xl:text-lg leading-relaxed pt-2">
            New accounts are reviewed by HR/Admin before access is granted, keeping attendance and company data secure.
          </p>
        </div>

        <div className="relative pt-6 border-t border-white/10 text-sm text-brand-300">
          © {new Date().getFullYear()} ZORX INDIA. All rights reserved.
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/90 shadow-card-lg">
          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={28} />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900">Account Created</h1>
              <p className="text-base text-slate-600 mt-2.5 leading-relaxed">
                Your account is awaiting admin approval. You&apos;ll be able to log in once HR/Admin approves your request.
              </p>
              <Link to="/login" className="block mt-8">
                <Button className="w-full" size="lg">
                  Login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center mb-8 text-center">
                <ZorxLogo variant="green" size="login" className="mb-4" />
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">Create Account</h1>
                <p className="text-base text-slate-600 mt-1.5">Sign up to request access to ZORX INDIA HRMS.</p>
              </div>

              {errors.form && (
                <div className="mb-6 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
                  {errors.form}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <Input label="Name" placeholder="Your full name" value={form.name} onChange={setField('name')} error={errors.name} required />
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@zorxindia.dev"
                  autoComplete="email"
                  value={form.email}
                  onChange={setField('email')}
                  error={errors.email}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={setField('password')}
                  error={errors.password}
                  hint={!errors.password ? 'At least 8 characters.' : undefined}
                  required
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={setField('confirmPassword')}
                  error={errors.confirmPassword}
                  required
                />
                <Button type="submit" className="w-full" size="lg" icon={UserPlus} loading={submitting}>
                  Sign Up
                </Button>
              </form>

              <p className="text-center text-sm text-slate-500 mt-6">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800 hover:underline">
                  Login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
