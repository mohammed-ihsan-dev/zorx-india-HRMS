import { useState } from 'react';
import { Menu, ChevronDown, LogOut, User, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, DropdownItem } from './Dropdown.jsx';
import { Avatar } from './Avatar.jsx';
import { NotificationBell } from '../features/notifications/NotificationBell.jsx';
import { ChangePasswordModal } from '../features/auth/ChangePasswordModal.jsx';
import { ZorxLogo } from './ZorxLogo.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { ROLE_LABELS } from '../utils/constants.js';

export function Topbar({ onMenuClick, title, profilePath }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const employee = user?.employee;
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 sm:gap-4 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-6 lg:px-8 py-3.5 sm:py-4 shadow-xs">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 sm:flex-initial">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
          aria-label="Toggle navigation menu"
        >
          <Menu size={22} />
        </button>
        <div className="lg:hidden shrink-0 pr-2 border-r border-slate-200">
          <ZorxLogo variant="green" size="sm" />
        </div>
        <h1 className="text-sm sm:text-2xl font-extrabold text-slate-900 truncate tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <NotificationBell />

        <Dropdown
          trigger={
            <button className="flex items-center gap-3 p-1.5 sm:px-3 sm:py-2 rounded-xl hover:bg-slate-100/80 transition-all border border-transparent hover:border-slate-200">
              <Avatar
                src={employee?.profileImage || employee?.avatarUrl}
                firstName={employee?.firstName}
                lastName={employee?.lastName}
                className="border border-brand-200 shadow-xs"
              />
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-sm font-semibold text-slate-900 leading-tight">
                  {employee ? `${employee.firstName} ${employee.lastName}` : user?.email}
                </span>
                <span className="text-xs text-slate-500 font-medium truncate max-w-[180px]">
                  {user?.email}
                </span>
                <span className="text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200/60 px-2 py-0.5 rounded-md mt-0.5 inline-block w-fit">
                  {ROLE_LABELS[user?.role] || user?.role}
                </span>
              </div>
              <ChevronDown size={18} className="text-slate-400 hidden sm:block shrink-0" />
            </button>
          }
        >
          {profilePath && (
            <DropdownItem onClick={() => navigate(profilePath)}>
              <User size={18} /> My Profile
            </DropdownItem>
          )}
          <DropdownItem onClick={() => setPasswordModalOpen(true)}>
            <KeyRound size={18} /> Change Password
          </DropdownItem>
          <div className="my-1.5 border-t border-slate-100" />
          <DropdownItem onClick={handleLogout} className="text-red-600 hover:bg-red-50">
            <LogOut size={18} /> Logout
          </DropdownItem>
        </Dropdown>
      </div>
      <ChangePasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />
    </header>
  );
}
