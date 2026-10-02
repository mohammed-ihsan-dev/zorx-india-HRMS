import { useEffect, useState } from 'react';
import { Menu, ChevronDown, LogOut, User, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, DropdownItem } from './Dropdown.jsx';
import { Avatar } from './Avatar.jsx';
import { NotificationBell } from '../features/notifications/NotificationBell.jsx';
import { ChangePasswordModal } from '../features/auth/ChangePasswordModal.jsx';
import { ZorxLogo } from './ZorxLogo.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { ROLE_LABELS } from '../utils/constants.js';
import {
  GANDHI_JAYANTI_IMAGE_SRC,
  shouldShowGandhiNavbarIcon,
  triggerGandhiCelebration,
} from '../features/gandhiJayanti/gandhiJayantiConfig.js';
import { GandhiJayantiCelebration } from '../features/gandhiJayanti/GandhiJayantiCelebration.jsx';

export function Topbar({ onMenuClick, title, profilePath }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const employee = user?.employee;
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [, setDateTick] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationKey, setCelebrationKey] = useState(0);

  // Authenticated user + October 2 (evaluated live on every render / route change)
  const showGandhiIcon = Boolean(user) && shouldShowGandhiNavbarIcon();

  useEffect(() => {
    const syncDate = () => setDateTick((prev) => prev + 1);

    // Sync on tab visibility / focus change (e.g. computer wakes up after midnight)
    window.addEventListener('visibilitychange', syncDate);
    window.addEventListener('focus', syncDate);

    // Lightweight boundary timer: wake up precisely at next local midnight without polling
    let midnightTimer;
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());
      midnightTimer = setTimeout(() => {
        syncDate();
        scheduleMidnight();
      }, delay);
    };
    scheduleMidnight();

    const handleCelebrated = () => syncDate();
    const handleReset = () => {
      setCelebrating(false);
      syncDate();
    };
    const handlePlay = () => {
      setCelebrating(true);
      setCelebrationKey((prev) => prev + 1);
    };

    window.addEventListener('gandhi-jayanti-celebrated', handleCelebrated);
    window.addEventListener('gandhi-jayanti-reset', handleReset);
    window.addEventListener('gandhi-jayanti-play', handlePlay);

    return () => {
      clearTimeout(midnightTimer);
      window.removeEventListener('visibilitychange', syncDate);
      window.removeEventListener('focus', syncDate);
      window.removeEventListener('gandhi-jayanti-celebrated', handleCelebrated);
      window.removeEventListener('gandhi-jayanti-reset', handleReset);
      window.removeEventListener('gandhi-jayanti-play', handlePlay);
    };
  }, []);

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

      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
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

        {/* All-Day Gandhi Icon & Replay Button (October 2 for all authenticated users) */}
        {showGandhiIcon && (
          <div className="flex items-center pl-2 sm:pl-3 border-l border-slate-200 shrink-0 select-none animate-fade-in">
            <button
              type="button"
              onClick={triggerGandhiCelebration}
              aria-label="Replay Gandhi Jayanti celebration"
              title="Happy Gandhi Jayanti — Replay celebration"
              className="relative flex items-center justify-center rounded-full p-0.5 group cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <img
                src={GANDHI_JAYANTI_IMAGE_SRC}
                alt=""
                aria-hidden="true"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover ring-2 ring-amber-400/80 shadow-xs group-hover:brightness-105 group-hover:ring-amber-400 transition-all duration-200"
              />
              <span className="sr-only">Replay Gandhi Jayanti celebration</span>
            </button>
          </div>
        )}
      </div>
      <ChangePasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />
      <GandhiJayantiCelebration
        key={celebrationKey}
        open={celebrating}
        onDismiss={() => setCelebrating(false)}
      />
    </header>
  );
}
