import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2, ShieldCheck, KeyRound, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { AuthCardLayout } from './AuthCardLayout.jsx';
import * as authService from '../../services/authService.js';
import { getErrorMessage } from '../../services/apiClient.js';

const STEP_COPY = {
  email: { title: 'Forgot Password', subtitle: "Enter your work email and we'll send you a 6-digit code." },
  otp: { title: 'Enter Code', subtitle: null },
  password: { title: 'New Password', subtitle: 'Choose a new password for your account.' },
  done: { title: 'Password Reset', subtitle: null },
};

export function ForgotPassword() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  // Kept only in memory: the password step is unreachable without a verified code.
  const [resetToken, setResetToken] = useState('');
  const [passwords, setPasswords] = useState({ newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const requestCode = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      setInfo(`${res.message} Check your inbox (and spam folder). The code expires in ${res.data?.expiresInMinutes ?? 10} minutes.`);
      setResendIn(res.data?.resendAfterSeconds ?? 60);
      setOtp('');
      setStep('otp');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send the code. Please check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (!busy) requestCode();
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (busy || otp.length !== 6) return;
    setError('');
    setBusy(true);
    try {
      const data = await authService.verifyPasswordResetOtp(email.trim(), otp);
      setResetToken(data.resetToken);
      setStep('password');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not verify the code. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const tooShort = passwords.newPassword.length > 0 && passwords.newPassword.length < 8;
  const mismatch = passwords.confirmPassword.length > 0 && passwords.confirmPassword !== passwords.newPassword;
  const canReset = passwords.newPassword.length >= 8 && passwords.confirmPassword === passwords.newPassword && !busy;

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!canReset) return;
    setError('');
    setBusy(true);
    try {
      await authService.resetPassword({ resetToken, ...passwords });
      setResetToken('');
      setStep('done');
    } catch (err) {
      const message = getErrorMessage(err, 'Could not reset your password. Please try again.');
      if (/session has expired/i.test(message)) {
        setResetToken('');
        setInfo('');
        setStep('email');
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const copy = STEP_COPY[step];
  const subtitle = step === 'otp' ? `We sent a code to ${email.trim()} if it belongs to an account.` : copy.subtitle;

  return (
    <AuthCardLayout title={copy.title} subtitle={subtitle}>
      {error && (
        <p role="alert" className="mb-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
          {error}
        </p>
      )}

      {step === 'email' && (
        <form onSubmit={handleEmailSubmit} className="space-y-5">
          <Input
            id="forgot-email"
            label="Email Address"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" size="lg" icon={Mail} loading={busy} className="w-full text-base sm:text-lg py-3.5 min-h-[50px] font-bold shadow-md">
            Send Code
          </Button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleOtpSubmit} className="space-y-5">
          {info && <p className="text-sm font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">{info}</p>}
          <Input
            id="forgot-otp"
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            className="text-center text-2xl font-bold tracking-[0.5em]"
            value={otp}
            // Digits only, capped at 6. No maxLength attribute: the browser would cut a
            // pasted "123 456" to 6 characters before the spaces are stripped.
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            hint={otp.length > 0 && otp.length < 6 ? 'Enter all 6 digits.' : undefined}
            required
          />
          <Button type="submit" size="lg" icon={ShieldCheck} loading={busy} disabled={otp.length !== 6 || busy} className="w-full text-base sm:text-lg py-3.5 min-h-[50px] font-bold shadow-md">
            Verify Code
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setStep('email'); setError(''); }} className="font-semibold text-slate-600 hover:text-slate-800 hover:underline">
              Change email
            </button>
            <button
              type="button"
              onClick={requestCode}
              disabled={resendIn > 0 || busy}
              className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
            >
              <RotateCcw size={14} />
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="space-y-5">
          <Input
            id="reset-new-password"
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={passwords.newPassword}
            onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
            hint={tooShort ? 'Password must be at least 8 characters.' : 'At least 8 characters.'}
            rightElement={
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            }
            required
          />
          <Input
            id="reset-confirm-password"
            label="Confirm New Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={passwords.confirmPassword}
            onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
            error={mismatch ? 'Passwords do not match.' : undefined}
            required
          />
          <Button type="submit" size="lg" icon={KeyRound} loading={busy} disabled={!canReset} className="w-full text-base sm:text-lg py-3.5 min-h-[50px] font-bold shadow-md">
            Reset Password
          </Button>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-6">
          <div role="status" className="flex items-start gap-3 text-sm font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-600 mt-0.5" />
            <span>Your password has been reset. For your security, you&apos;ve been signed out on all devices.</span>
          </div>
          <Link to="/login" className="block">
            <Button className="w-full">Sign In</Button>
          </Link>
        </div>
      )}

      {step !== 'done' && (
        <p className="text-center text-sm text-slate-500 mt-6">
          <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 hover:underline">
            <ArrowLeft size={15} /> Back to Sign In
          </Link>
        </p>
      )}
    </AuthCardLayout>
  );
}
