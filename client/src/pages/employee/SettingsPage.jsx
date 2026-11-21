import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { ChangePasswordModal } from '../../features/auth/ChangePasswordModal.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { ROLE_LABELS } from '../../utils/constants.js';

export function SettingsPage() {
  const { user, logoutAll } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="space-y-6 max-w-lg">
      <Card padded={false} className="p-5">
        <CardHeader title="Account" subtitle="Your account details" />
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-800">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium text-slate-800">{ROLE_LABELS[user?.role] || user?.role}</dd>
          </div>
        </dl>
      </Card>

      <Card padded={false} className="p-5">
        <CardHeader title="Security" subtitle="Keep your account secure" />
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" icon={KeyRound} onClick={() => setModalOpen(true)}>
            Change Password
          </Button>
          <Button variant="outline" icon={LogOut} onClick={() => setSignOutAllOpen(true)}>
            Sign out on all devices
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">You stay signed in on this device for up to 30 days unless you sign out.</p>
      </Card>

      <ChangePasswordModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <ConfirmDialog
        open={signOutAllOpen}
        onClose={() => !signingOut && setSignOutAllOpen(false)}
        onConfirm={async () => {
          setSigningOut(true);
          try {
            await logoutAll();
          } finally {
            setSigningOut(false);
          }
        }}
        loading={signingOut}
        title="Sign out on all devices?"
        description="Every phone and computer signed in to your account, including this one, will need to sign in again."
        confirmLabel="Sign out everywhere"
        variant="danger"
      />
    </div>
  );
}
