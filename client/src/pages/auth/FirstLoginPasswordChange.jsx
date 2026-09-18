import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldAlert, KeyRound } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { ZorxLogo } from '../../components/ZorxLogo.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import * as authService from '../../services/authService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useToast } from '../../hooks/useToast.js';
import { BACK_OFFICE_ROLES } from '../../utils/constants.js';

export function FirstLoginPasswordChange() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!newPassword) {
      setError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword === '1234' || newPassword === 'Password' || newPassword === 'Zorx@Dev123') {
      setError('Your new password cannot be the temporary password. Please choose a secure password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      const updatedUser = await refreshUser();
      toast.success('Password updated successfully.');
      const isBackOffice = updatedUser && BACK_OFFICE_ROLES.includes(updatedUser.role);
      navigate(isBackOffice ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update password. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 sm:p-12 font-sans">
      <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/90 shadow-card-lg space-y-6">
        <div className="flex flex-col items-center text-center">
          <ZorxLogo variant="green" size="login" className="mb-4" />
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-3">
            <KeyRound size={24} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">SET YOUR NEW PASSWORD</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            For security reasons, your account requires a password update on first login before accessing your workspace.
          </p>
        </div>

        <div className="flex items-center gap-2.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200/90 rounded-2xl p-3.5">
          <ShieldAlert size={18} className="text-amber-700 shrink-0" />
          <span>This temporary password setup is required for first-time access.</span>
        </div>

        {error && (
          <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Current / Temporary Password (Optional)"
            type="password"
            autoComplete="current-password"
            placeholder="Enter temporary password if prompted"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />

          <Input
            label="New Password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter new password (min 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          <Input
            label="Confirm New Password"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <Button
            type="submit"
            size="lg"
            icon={Lock}
            loading={submitting}
            className="w-full text-base font-bold py-3.5 shadow-md"
          >
            UPDATE PASSWORD
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-100 flex justify-center">
          <button
            type="button"
            onClick={logout}
            className="text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors"
          >
            Sign out and return to login
          </button>
        </div>
      </div>
    </div>
  );
}
