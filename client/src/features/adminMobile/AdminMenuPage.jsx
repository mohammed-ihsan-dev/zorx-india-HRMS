import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ChevronRight, KeyRound, LogOut } from 'lucide-react';
import { Avatar } from '../../components/Avatar.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { ChangePasswordModal } from '../auth/ChangePasswordModal.jsx';
import { MenuRow, Section, CheckForUpdatesRow } from '../../pages/employee/Menu.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useMobileShell } from '../../context/MobileShellContext.jsx';
import { adminMenuGroupsFor } from '../../routes/adminMobileConfig.js';
import { ROLE_LABELS } from '../../utils/constants.js';

/**
 * HR / Super Admin phone menu — the Employee phone Menu's design, with every module
 * the role can open on desktop (adminMobileConfig guarantees none is left out).
 */
export function AdminMenuPage() {
  const mobile = useMobileShell();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Tablet/desktop have the sidebar; this page exists only in the phone shell.
  if (!mobile) return <Navigate to="/admin" replace />;

  const employee = user?.employee;
  const name = employee ? `${employee.firstName} ${employee.lastName || ''}`.trim() : user?.email;
  const subtitle = [employee?.designation || ROLE_LABELS[user?.role], employee?.employeeCode && `ID: ${employee.employeeCode}`].filter(Boolean).join(' · ');
  const groups = adminMenuGroupsFor(user);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="space-y-5 max-w-md mx-auto">
      <div className="sticky -top-3 z-10 -mx-4 px-4 pt-3 pb-2 -mt-3 bg-zm-bg">
        <h1 className="text-2xl font-extrabold text-zm-text tracking-tight">Menu</h1>
      </div>

      <Link to="/admin/profile" className="flex items-center justify-between gap-3 rounded-2xl bg-zm-card border border-zm-border p-4">
        <span className="flex items-center gap-3.5 min-w-0">
          <Avatar src={employee?.profileImage || employee?.avatarUrl} firstName={employee?.firstName} lastName={employee?.lastName} size="w-14 h-14" className="ring-2 ring-zm-accent shrink-0" />
          <span className="min-w-0">
            <span className="block text-lg font-bold text-zm-text truncate">{name}</span>
            {subtitle && <span className="block text-xs text-zm-muted truncate">{subtitle}</span>}
            <span className="block text-xs font-semibold text-zm-accent-light mt-0.5">My Profile</span>
          </span>
        </span>
        <ChevronRight size={20} className="text-zm-muted shrink-0" aria-hidden="true" />
      </Link>

      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          {g.items.map((item) => (
            <MenuRow key={item.to} icon={item.icon} label={item.label} detail={item.detail} to={item.to} />
          ))}
          {(g.title === 'Account' || g.title === 'System') && <MenuRow icon={KeyRound} label="Change Password" onClick={() => setPasswordOpen(true)} />}
          {(g.title === 'Account' || g.title === 'System') && <CheckForUpdatesRow />}
        </Section>
      ))}

      <button
        type="button"
        onClick={() => setLogoutOpen(true)}
        className="w-full h-14 rounded-2xl bg-rose-500/10 border border-rose-400/30 text-rose-300 font-bold flex items-center justify-center gap-2"
      >
        <LogOut size={18} aria-hidden="true" /> Logout
      </button>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleLogout}
        title="Log out?"
        description="You will need to sign in again on this device."
        confirmLabel="Logout"
        variant="danger"
      />
    </div>
  );
}
