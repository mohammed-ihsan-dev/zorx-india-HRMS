import { Info } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { InfoRow } from '../../components/InfoRow.jsx';
import { formatDate } from '../../utils/formatters.js';

export function AdditionalInfoCard({ profile }) {
  return (
    <Card>
      <CardHeader title="Additional Information" action={<Info size={20} className="text-brand-700" />} />
      <dl className="divide-y divide-slate-100">
        <InfoRow label="Date of Birth" value={profile.dateOfBirth ? formatDate(profile.dateOfBirth) : null} />
      </dl>
      <p className="text-xs text-slate-400 mt-3">
        Need to add or correct your date of birth? Use &quot;Request Information Update&quot; below.
      </p>
    </Card>
  );
}
