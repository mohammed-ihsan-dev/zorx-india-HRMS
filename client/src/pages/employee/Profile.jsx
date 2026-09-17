import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, User, FileText, FileEdit, ShieldCheck } from 'lucide-react';
import { ProfileSummaryCard } from '../../features/profile/ProfileSummaryCard.jsx';
import { PersonalInfoTab } from '../../features/profile/PersonalInfoTab.jsx';
import { DocumentsTab } from '../../features/profile/DocumentsTab.jsx';
import { EditRequestsTab } from '../../features/profile/EditRequestsTab.jsx';
import { SecurityTab } from '../../features/profile/SecurityTab.jsx';
import { Tabs } from '../../components/Tabs.jsx';
import { Loader } from '../../components/Loader.jsx';
import * as employeeService from '../../services/employeeService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useAuth } from '../../hooks/useAuth.js';

const TABS = [
  { key: 'personal', label: 'Personal Information', icon: User },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'requests', label: 'Edit Requests', icon: FileEdit },
  { key: 'security', label: 'Security', icon: ShieldCheck },
];

export function Profile() {
  const toast = useToast();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('personal');

  useEffect(() => {
    employeeService
      .getMyProfile()
      .then(setProfile)
      .catch((err) => toast.error(getErrorMessage(err, 'Unable to load profile.')))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <Loader label="Loading profile…" />;
  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">My Profile</h2>
          <p className="text-base text-slate-500 mt-1">View and manage your personal information</p>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-400">
          <Link to="/" className="hover:text-brand-700">
            Home
          </Link>
          <ChevronRight size={14} />
          <span className="text-slate-600 font-semibold">My Profile</span>
        </div>
      </div>

      <ProfileSummaryCard profile={profile} />

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'personal' && <PersonalInfoTab profile={profile} email={user?.email} onProfileUpdated={setProfile} />}
      {activeTab === 'documents' && <DocumentsTab />}
      {activeTab === 'requests' && <EditRequestsTab profile={profile} />}
      {activeTab === 'security' && <SecurityTab />}
    </div>
  );
}
