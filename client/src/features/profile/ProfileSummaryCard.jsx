import { Building2, Briefcase, CalendarDays, UserCircle2 } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Badge } from '../../components/Badge.jsx';
import { initials, formatDate } from '../../utils/formatters.js';

export function ProfileSummaryCard({ profile }) {
  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-3xl font-extrabold shrink-0">
          {initials(profile.firstName, profile.lastName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {profile.firstName} {profile.lastName}
            </h2>
            <Badge color={profile.status === 'ACTIVE' ? 'green' : 'slate'}>{profile.status}</Badge>
          </div>
          <p className="text-base text-slate-500 font-semibold mt-1">
            {profile.designation || 'No designation set'} <span className="text-slate-300 mx-1">•</span> {profile.employeeCode}
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-slate-600 font-medium">
            <span className="flex items-center gap-1.5">
              <Building2 size={16} className="text-brand-700" />
              {profile.departmentId?.name || 'No department'}
            </span>
            <span className="flex items-center gap-1.5">
              <Briefcase size={16} className="text-brand-700" />
              {profile.employmentType?.replace('_', ' ') || '—'}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays size={16} className="text-brand-700" />
              Joined {formatDate(profile.joiningDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <UserCircle2 size={16} className="text-brand-700" />
              {profile.managerId ? `${profile.managerId.firstName} ${profile.managerId.lastName}` : 'No reporting manager'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
