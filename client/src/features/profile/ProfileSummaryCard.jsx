import { Building2, Briefcase, CalendarDays, UserCircle2 } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Badge } from '../../components/Badge.jsx';
import { initials, formatDate, isNotProvided } from '../../utils/formatters.js';

export function ProfileSummaryCard({ profile }) {
  const notProvidedBadge = (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200/80">
      Not Provided
    </span>
  );

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        {profile.profileImage || profile.avatarUrl ? (
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-brand-200/80 shadow-sm shrink-0">
            <img
              src={profile.profileImage || profile.avatarUrl}
              alt={`${profile.firstName} ${profile.lastName}`}
              className={`w-full h-full object-cover ${
                (profile.profileImage || profile.avatarUrl || '').includes('ajmal') ? 'scale-125 object-[center_20%]' : ''
              }`}
            />
          </div>
        ) : (
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-3xl font-extrabold shrink-0">
            {initials(profile.firstName, profile.lastName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {profile.firstName} {profile.lastName}
            </h2>
            <Badge color={profile.status === 'ACTIVE' ? 'green' : 'slate'}>{profile.status}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-base text-slate-500 font-semibold mt-1">
            <span>{isNotProvided(profile.designation) ? notProvidedBadge : profile.designation}</span>
            <span className="text-slate-300">•</span>
            <span>{isNotProvided(profile.employeeCode) ? notProvidedBadge : profile.employeeCode}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-slate-600 font-medium">
            <span className="flex items-center gap-1.5">
              <Building2 size={16} className="text-brand-700" />
              {isNotProvided(profile.departmentId?.name) ? notProvidedBadge : profile.departmentId?.name}
            </span>
            <span className="flex items-center gap-1.5">
              <Briefcase size={16} className="text-brand-700" />
              {isNotProvided(profile.employmentType) ? notProvidedBadge : profile.employmentType?.replace('_', ' ')}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays size={16} className="text-brand-700" />
              Joined {formatDate(profile.joiningDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <UserCircle2 size={16} className="text-brand-700" />
              {profile.managerId ? `${profile.managerId.firstName} ${profile.managerId.lastName}` : notProvidedBadge}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
