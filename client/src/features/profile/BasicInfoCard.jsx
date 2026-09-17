import { UserCog } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { InfoRow } from '../../components/InfoRow.jsx';
import { formatDate, titleCase } from '../../utils/formatters.js';

export function BasicInfoCard({ profile, email }) {
  return (
    <Card>
      <CardHeader title="Basic Information" subtitle="Managed by HR/Admin" action={<UserCog size={20} className="text-brand-700" />} />
      <dl className="divide-y divide-slate-100">
        <InfoRow label="Full Name" value={`${profile.firstName} ${profile.lastName}`} />
        <InfoRow label="Employee ID" value={profile.employeeCode} />
        <InfoRow label="Email" value={email} />
        <InfoRow label="Department" value={profile.departmentId?.name} />
        <InfoRow label="Designation" value={profile.designation} />
        <InfoRow label="Employment Type" value={profile.employmentType ? titleCase(profile.employmentType) : null} />
        <InfoRow label="Joining Date" value={formatDate(profile.joiningDate)} />
        <InfoRow
          label="Reporting Manager"
          value={profile.managerId ? `${profile.managerId.firstName} ${profile.managerId.lastName}` : null}
        />
      </dl>
    </Card>
  );
}
