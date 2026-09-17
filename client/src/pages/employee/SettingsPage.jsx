import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { ChangePasswordModal } from '../../features/auth/ChangePasswordModal.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { ROLE_LABELS } from '../../utils/constants.js';

export function SettingsPage() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

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
        <Button variant="outline" icon={KeyRound} onClick={() => setModalOpen(true)}>
          Change Password
        </Button>
      </Card>

      <ChangePasswordModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
