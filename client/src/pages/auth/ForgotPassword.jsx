import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { AuthCardLayout } from './AuthCardLayout.jsx';
import * as authService from '../../services/authService.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      setSentMessage(res.message);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send the reset link. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCardLayout title="Forgot Password" subtitle="Enter your work email and we'll send you a link to reset your password.">
      {sentMessage ? (
        <div className="space-y-6">
          <div role="status" className="flex items-start gap-3 text-sm font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-600 mt-0.5" />
            <span>{sentMessage} Check your inbox (and spam folder).</span>
          </div>
          <Button variant="outline" className="w-full" onClick={() => setSentMessage('')}>
            Send again
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="forgot-email"
            label="Email Address"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
            required
          />
          <Button type="submit" size="lg" icon={Mail} loading={submitting} className="w-full text-base sm:text-lg py-3.5 min-h-[50px] font-bold shadow-md">
            Send Reset Link
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-slate-500 mt-6">
        <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 hover:underline">
          <ArrowLeft size={15} /> Back to Sign In
        </Link>
      </p>
    </AuthCardLayout>
  );
}
