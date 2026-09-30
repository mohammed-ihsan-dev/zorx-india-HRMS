import { UserCog } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { InfoRow } from '../../components/InfoRow.jsx';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { useAuth } from '../../hooks/useAuth.js';
import { ROLE_LABELS } from '../../utils/constants.js';

export function BasicInfoCard({ profile, email }) {
  const { user } = useAuth();
  const displayRole = ROLE_LABELS[user?.role] || user?.role || profile?.role;
  const displayStatus = user?.status || profile?.status || 'ACTIVE';

  return (
    <Card>
      <CardHeader title="Basic Information" subtitle="Managed by HR/Admin" action={<UserCog size={20} className="text-brand-700" />} />
      <dl className="divide-y divide-slate-100">
        <InfoRow label="Full Name" value={`${profile.firstName} ${profile.lastName || ''}`.trim()} />
        <InfoRow label="Email" value={email || user?.email || profile?.email} />
        <InfoRow label="Role" value={displayRole} />
        <InfoRow label="Account Status" value={displayStatus} />
        <InfoRow label="Employee ID" value={profile.employeeCode} />
        <InfoRow label="Department" value={profile.departmentId?.name} />
        <InfoRow label="Designation" value={profile.designation} />
        <InfoRow label="Employment Type" value={profile.employmentType ? titleCase(profile.employmentType) : null} />
        <InfoRow label="Joining Date" value={formatDate(profile.joiningDate)} />
      </dl>
    </Card>
  );
}
