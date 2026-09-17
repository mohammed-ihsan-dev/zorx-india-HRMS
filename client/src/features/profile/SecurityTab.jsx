import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { ChangePasswordModal } from '../auth/ChangePasswordModal.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { ROLE_LABELS } from '../../utils/constants.js';
import { InfoRow } from '../../components/InfoRow.jsx';

export function SecurityTab() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Account" subtitle="Your login details" action={<ShieldCheck size={20} className="text-brand-700" />} />
        <dl className="divide-y divide-slate-100">
          <InfoRow label="Email" value={user?.email} />
          <InfoRow label="Role" value={ROLE_LABELS[user?.role] || user?.role} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Password" subtitle="Keep your account secure with a strong password" />
        <Button variant="outline" icon={KeyRound} onClick={() => setModalOpen(true)}>
          Change Password
        </Button>
      </Card>

      <ChangePasswordModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
