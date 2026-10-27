import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ChevronRight, KeyRound, LogOut, RefreshCw, Loader2 } from 'lucide-react';
import { Avatar } from '../../components/Avatar.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { ChangePasswordModal } from '../../features/auth/ChangePasswordModal.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useMobileShell } from '../../context/MobileShellContext.jsx';
import { employeeNavItems, employeeMobileMenuItems } from '../../routes/navConfig.js';
import { useCheckForUpdates } from '../../pwa/useCheckForUpdates.js';

// Destinations already in the bottom navigation.
const IN_BOTTOM_NAV = ['/', '/attendance', '/leave', '/announcements'];

// Every other employee page from the sidebar config, grouped for the phone menu.
// Anything not listed here still shows up under "More", so nothing is ever dropped.
const GROUPS = [
  { title: 'Work', paths: ['/tasks', '/work-from-home', '/content-calendar'] },
  { title: 'Updates', paths: ['/notifications', '/payslips'] },
  { title: 'Account', paths: ['/profile', '/settings'] },
];

function MenuRow({ icon: Icon, label, to, onClick, detail, busy = false, tone = 'text-zm-text' }) {
  const inner = (
    <>
      <span className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-xl bg-zm-elev text-zm-green-light flex items-center justify-center shrink-0" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="min-w-0">
          <span className={`block text-sm font-semibold truncate ${tone}`}>{label}</span>
          {detail && <span className="block text-xs text-zm-muted leading-snug">{detail}</span>}
        </span>
      </span>
      {busy ? (
        <Loader2 size={18} className="text-zm-green-light shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <ChevronRight size={18} className="text-zm-muted shrink-0" aria-hidden="true" />
      )}
    </>
  );
  const cls = 'w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-2.5 text-left active:bg-white/5 disabled:opacity-80';
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={busy} aria-busy={busy || undefined} className={cls}>
      {inner}
    </button>
  );
}

const UPDATE_TONE = { current: 'text-zm-green-light', available: 'text-amber-300', error: 'text-rose-300' };

/** Real check against the deployed version (same logic as automatic updates). */
function CheckForUpdatesRow() {
  const { state, run, title, detail } = useCheckForUpdates();
  return (
    <div aria-live="polite">
      <MenuRow icon={RefreshCw} label={title} detail={detail} onClick={run} busy={state === 'checking'} tone={UPDATE_TONE[state] || 'text-zm-text'} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-zm-muted">{title}</h2>
      <div className="rounded-2xl bg-zm-card border border-zm-border divide-y divide-zm-border overflow-hidden">{children}</div>
    </section>
  );
}

/** Phone-only menu: profile, every secondary employee page, password and logout. */
export function MenuPage() {
  const mobile = useMobileShell();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const employee = user?.employee;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Tablet/desktop already have the sidebar; this page is only for the phone shell.
  if (!mobile) return <Navigate to="/" replace />;

  const secondary = [...employeeNavItems, ...employeeMobileMenuItems].filter((item) => !IN_BOTTOM_NAV.includes(item.to));
  const grouped = GROUPS.map((g) => ({ ...g, items: g.paths.map((p) => secondary.find((i) => i.to === p)).filter(Boolean) }));
  const leftovers = secondary.filter((i) => !GROUPS.some((g) => g.paths.includes(i.to)));
  if (leftovers.length) grouped.push({ title: 'More', items: leftovers });

  const name = employee ? `${employee.firstName} ${employee.lastName || ''}`.trim() : user?.email;
  const subtitle = [employee?.designation, employee?.employeeCode && `ID: ${employee.employeeCode}`].filter(Boolean).join(' · ');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="space-y-5 max-w-md mx-auto">
      {/* Pinned to the top of the shell's scroll area (EmployeeLayout's <main>), like the
          Calendar month header; the opaque bleed keeps rows from showing through. */}
      <div className="sticky -top-3 z-10 -mx-4 px-4 pt-3 pb-2 -mt-3 bg-zm-bg">
        <h1 className="text-2xl font-extrabold text-zm-text tracking-tight">Menu</h1>
      </div>

      <Link to="/profile" className="flex items-center justify-between gap-3 rounded-2xl bg-zm-card border border-zm-border p-4">
        <span className="flex items-center gap-3.5 min-w-0">
          <Avatar
            src={employee?.profileImage || employee?.avatarUrl}
            firstName={employee?.firstName}
            lastName={employee?.lastName}
            size="w-14 h-14"
            className="ring-2 ring-zm-green shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-lg font-bold text-zm-text truncate">{name}</span>
            {subtitle && <span className="block text-xs text-zm-muted truncate">{subtitle}</span>}
            <span className="block text-xs font-semibold text-zm-green-light mt-0.5">My Profile</span>
          </span>
        </span>
        <ChevronRight size={20} className="text-zm-muted shrink-0" aria-hidden="true" />
      </Link>

      {grouped
        .filter((g) => g.items.length)
        .map((g) => (
          <Section key={g.title} title={g.title}>
            {g.items.map((item) => (
              <MenuRow key={item.to} icon={item.icon} label={item.label} to={item.to} />
            ))}
            {g.title === 'Account' && <MenuRow icon={KeyRound} label="Change Password" onClick={() => setPasswordOpen(true)} />}
            {g.title === 'Account' && <CheckForUpdatesRow />}
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
