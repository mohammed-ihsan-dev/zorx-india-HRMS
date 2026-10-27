import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  Coffee,
  Clock,
  LogOut,
  Play,
  RotateCcw,
  LoaderCircle,
  AlertTriangle,
  House,
  Wifi,
  MapPin,
  CheckCircle2,
  ListChecks,
  ChevronRight,
  Target,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { MobileStatusPill } from '../../components/MobileStatusPill.jsx';
import { ATTENDANCE_UI_STATE } from '../attendance/useTodayAttendance.js';
import { BreakAlertSettings } from '../attendance/BreakReminderWatcher.jsx';
import { breakTimeLeft, BREAK_TONE } from '../attendance/breakTimeLeft.js';
import { NetworkStatusBanner } from '../attendance/NetworkStatusBanner.jsx';
import { WfhTodayBanner } from '../workFromHome/WfhTodayBanner.jsx';
import { useCheckInCelebration } from '../gandhiJayanti/useCheckInCelebration.js';
import { LOCATION_STATUS } from '../../hooks/useGeolocation.js';
import * as notificationService from '../../services/notificationService.js';
import { formatDate, formatTime, formatMinutes } from '../../utils/formatters.js';

const OPEN_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW'];

/** "09:30" → "09:30 am" */
function formatClock(hhmm) {
  if (!hhmm) return '';
  const [h, m = '00'] = hhmm.split(':');
  const hour = Number(h);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${m} ${hour >= 12 ? 'pm' : 'am'}`;
}

/** Unread count from the existing notifications API (same source as the desktop bell). */
function useUnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      notificationService
        .listNotifications({ limit: 1 })
        .then((res) => alive && setCount(res?.meta?.unreadCount || 0))
        .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return count;
}

// Remaining-allowance bar colours; the exhausted state leaves only the neutral track.
const BREAK_BAR = {
  [BREAK_TONE.GREEN]: { bar: 'bg-zm-green-light', text: 'text-zm-green-light' },
  [BREAK_TONE.ORANGE]: { bar: 'bg-orange-400', text: 'text-orange-300' },
  [BREAK_TONE.RED]: { bar: 'bg-rose-500', text: 'text-rose-300' },
  [BREAK_TONE.EXHAUSTED]: { bar: '', text: 'text-rose-300' },
};

/** Daily break allowance left, as a bar. Display only — never ends a break. */
function BreakTimeLeft({ allowanceMinutes, remainingSeconds }) {
  const { tone, remainingMinutes, percent } = breakTimeLeft(allowanceMinutes, remainingSeconds);
  const style = BREAK_BAR[tone];
  const text = tone === BREAK_TONE.EXHAUSTED ? 'Break time exhausted' : `${remainingMinutes} min left`;
  return (
    <section aria-label="Break time left" className="rounded-2xl bg-zm-card border border-zm-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-zm-text">
          <Coffee size={15} className="text-zm-green-light" aria-hidden="true" />
          Break Time Left
        </p>
        <p className={`text-sm font-bold tabular-nums ${style.text}`}>{text}</p>
      </div>
      <div
        className="mt-2.5 h-2.5 rounded-full bg-zm-elev overflow-hidden"
        role="progressbar"
        aria-label="Break time left"
        aria-valuemin={0}
        aria-valuemax={allowanceMinutes}
        aria-valuenow={remainingMinutes}
        aria-valuetext={text}
      >
        {percent > 0 && <div className={`h-full rounded-full transition-[width] duration-500 ${style.bar}`} style={{ width: `${percent}%` }} />}
      </div>
    </section>
  );
}

/**
 * Phone dashboard. Presentation only — every value comes from
 * useTodayAttendance (the same hook and calculations as the desktop cards).
 */
export function MobileDashboardView({ attendance, tasks, tasksLoading }) {
  const { user } = useAuth();
  const toast = useToast();
  const employee = user?.employee;
  const isTestUser = import.meta.env.DEV && Boolean(user?.isVirtualTestUser);
  const unread = useUnreadCount();

  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const {
    loading,
    submitting,
    record,
    officeSettings,
    uiState,
    breakSubmitting,
    workedMinutes,
    requiredMinutes,
    remainingMinutes,
    overtimeMinutes,
    progressPercent,
    breakMinutesUsed,
    maxBreakMinutes,
    breakRemainingSeconds,
    breakCountdownStr,
    geolocation,
    defaultWfh,
    verificationMode,
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    resetVirtualAttendance,
  } = attendance;

  const celebration = useCheckInCelebration(record);
  const wifiMode = verificationMode === 'WIFI' && !defaultWfh;
  const PunchIcon = defaultWfh ? House : wifiMode ? Wifi : MapPin;
  const notStarted = uiState === ATTENDANCE_UI_STATE.NOT_CHECKED_IN;

  // HH:MM:SS of net working time (already excludes recorded breaks).
  const totalSeconds = Math.max(0, Math.floor((workedMinutes || 0) * 60));
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');

  // The employee's own official start time when set (e.g. 10:00), else the office's.
  const startTime = employee?.workingStartTime || officeSettings?.workingStartTime;
  const shiftTiming = startTime && officeSettings?.workingEndTime ? `${formatClock(startTime)} – ${formatClock(officeSettings.workingEndTime)}` : '—';

  const name = employee?.firstName ? `${employee.firstName} ${employee.lastName || ''}`.trim() : user?.email;
  const openTasks = (tasks || []).filter((t) => OPEN_TASK_STATUSES.includes(t.status)).length;

  const handleCheckIn = () => {
    celebration.markCheckInAttempt();
    checkIn();
  };

  const handleResetCheckIn = async () => {
    if (!isTestUser) return;
    try {
      setResetting(true);
      await resetVirtualAttendance?.();
      celebration.resetForTestUser();
      toast.success('Test check-in reset. Ready to test check-in again.');
    } catch {
      toast.error('Failed to reset test check-in.');
    } finally {
      setResetting(false);
    }
  };

  const locationError = [LOCATION_STATUS.LOCATION_PERMISSION_DENIED, LOCATION_STATUS.LOCATION_UNAVAILABLE, LOCATION_STATUS.LOCATION_ERROR].includes(
    geolocation?.status
  );

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zm-muted">Welcome back</p>
          <h1 className="text-xl font-extrabold text-zm-text tracking-tight truncate">{name}</h1>
        </div>
        <Link
          to="/notifications"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative w-11 h-11 shrink-0 rounded-full border border-zm-green/50 bg-zm-card text-zm-green-light flex items-center justify-center"
        >
          <Bell size={20} aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
      </header>

      {/* Date */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zm-card border border-zm-border text-xs font-semibold text-zm-text">
        <CalendarDays size={14} className="text-zm-green-light" aria-hidden="true" />
        {formatDate(new Date(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>

      {/* Working hours — primary card */}
      {loading ? (
        <div className="h-56 rounded-3xl bg-zm-card animate-pulse" />
      ) : (
        <section
          aria-label="Working hours"
          className="relative overflow-hidden rounded-3xl p-5 text-white bg-gradient-to-br from-zm-green via-zm-green-dark to-[#0c4f2b] shadow-lg shadow-black/30"
        >
          <svg aria-hidden="true" className="absolute -right-12 -top-12 w-64 h-64 opacity-15 pointer-events-none" viewBox="0 0 200 200" fill="none" stroke="currentColor">
            <circle cx="150" cy="50" r="40" strokeWidth="1.2" />
            <circle cx="150" cy="50" r="70" strokeWidth="1.2" />
            <circle cx="150" cy="50" r="100" strokeWidth="1.2" />
          </svg>
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zm-pista/90">Working Hours</p>
              {record?.status && <MobileStatusPill status={record.status} className="!bg-black/20 !border-white/20" />}
            </div>
            <p className="mt-1.5 flex items-baseline gap-1 tabular-nums" aria-label={`${formatMinutes(workedMinutes)} worked`}>
              <span className="text-[44px] leading-none font-extrabold tracking-tight">
                {hh}:{mm}
              </span>
              <span className="text-xl font-bold text-zm-pista/80">:{ss}</span>
            </p>
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-black/25 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent || 0)} aria-label="Progress toward the daily target">
                <div className="h-full rounded-full bg-zm-pista transition-[width] duration-500" style={{ width: `${progressPercent || 0}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-zm-pista/90 flex items-center gap-1.5">
                <Target size={13} aria-hidden="true" />
                {notStarted
                  ? `${formatMinutes(requiredMinutes)} required today`
                  : overtimeMinutes > 0
                  ? `Target ${formatMinutes(requiredMinutes)} met · +${formatMinutes(overtimeMinutes)}`
                  : `${formatMinutes(remainingMinutes)} left of ${formatMinutes(requiredMinutes)}`}
              </p>
            </div>
            <dl className="mt-4 divide-y divide-white/15 border-t border-white/15 text-sm">
              <div className="flex items-center justify-between py-3">
                <dt className="flex items-center gap-2.5 text-zm-pista/90">
                  <span className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center" aria-hidden="true">
                    <Coffee size={15} />
                  </span>
                  Total Break Time
                </dt>
                <dd className="font-bold tabular-nums">{formatMinutes(breakMinutesUsed || 0)}</dd>
              </div>
              <div className="flex items-center justify-between pt-3">
                <dt className="flex items-center gap-2.5 text-zm-pista/90">
                  <span className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center" aria-hidden="true">
                    <Clock size={15} />
                  </span>
                  Shift Timing
                </dt>
                <dd className="font-bold tabular-nums">{shiftTiming}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {!loading && (
        <BreakTimeLeft allowanceMinutes={maxBreakMinutes} remainingSeconds={breakRemainingSeconds} />
      )}

      {/* Punch actions */}
      {!loading && (
        <section aria-label="Attendance actions" className="rounded-3xl bg-zm-card border border-zm-border p-4 space-y-3">
          <div className="empty:hidden space-y-2">
            <WfhTodayBanner record={record} />
            {wifiMode && <NetworkStatusBanner />}
          </div>

          {submitting && geolocation?.status === LOCATION_STATUS.CHECKING_LOCATION && (
            <p role="status" className="flex items-center gap-2 text-xs font-semibold text-zm-text bg-zm-elev p-2.5 rounded-xl">
              <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> Checking your GPS location…
            </p>
          )}
          {locationError && (
            <p role="alert" className="flex items-start gap-2 text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-400/30 p-2.5 rounded-xl">
              <AlertTriangle size={15} className="shrink-0 mt-px" aria-hidden="true" /> {geolocation.errorMessage}
            </p>
          )}

          {(record?.checkIn || record?.checkOut) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-zm-elev px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zm-muted">Check In</p>
                <p className="text-base font-bold text-zm-text">{record?.checkIn ? formatTime(record.checkIn.timestamp) : '—'}</p>
              </div>
              <div className="rounded-2xl bg-zm-elev px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zm-muted">Check Out</p>
                <p className="text-base font-bold text-zm-text">{record?.checkOut ? formatTime(record.checkOut.timestamp) : '—'}</p>
              </div>
            </div>
          )}

          {uiState === ATTENDANCE_UI_STATE.NOT_CHECKED_IN && (
            <>
              <p className="text-sm text-zm-muted text-center">You haven&apos;t checked in yet today.</p>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCheckIn}
                className="w-full h-14 rounded-2xl bg-zm-green hover:bg-zm-green-dark active:scale-[0.99] text-white font-extrabold tracking-wide uppercase flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {submitting ? <LoaderCircle size={22} className="animate-spin" aria-label="Checking in" /> : (<><PunchIcon size={19} aria-hidden="true" /> Check In</>)}
              </button>
            </>
          )}

          {uiState === ATTENDANCE_UI_STATE.WORKING && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={breakSubmitting}
                onClick={() => startBreak('TEA')}
                className="h-12 rounded-2xl bg-amber-500/15 border border-amber-400/40 text-amber-200 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition disabled:opacity-50"
              >
                {breakSubmitting ? <LoaderCircle size={18} className="animate-spin" aria-label="Starting break" /> : (<><Coffee size={17} aria-hidden="true" /> Start Break</>)}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmCheckoutOpen(true)}
                className="h-12 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-200 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition disabled:opacity-50"
              >
                {submitting ? <LoaderCircle size={18} className="animate-spin" aria-label="Checking out" /> : (<><LogOut size={17} aria-hidden="true" /> Check Out</>)}
              </button>
            </div>
          )}

          {uiState === ATTENDANCE_UI_STATE.ON_BREAK && (
            <div>
              <button
                type="button"
                disabled={breakSubmitting}
                onClick={endBreak}
                className="w-full h-14 rounded-2xl bg-zm-green hover:bg-zm-green-dark active:scale-[0.99] text-white font-extrabold uppercase tracking-wide flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {breakSubmitting ? (
                  <LoaderCircle size={22} className="animate-spin" aria-label="Ending break" />
                ) : (
                  <>
                    <Play size={18} fill="currentColor" aria-hidden="true" /> End Break
                    <span className="tabular-nums font-bold text-zm-pista">{breakCountdownStr || '60:00'}</span>
                  </>
                )}
              </button>
              <BreakAlertSettings />
            </div>
          )}

          {uiState === ATTENDANCE_UI_STATE.COMPLETED && (
            <p className="h-12 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 font-bold text-sm flex items-center justify-center gap-2">
              <CheckCircle2 size={18} aria-hidden="true" /> Attendance completed for today
            </p>
          )}

          {isTestUser && (
            <div className="pt-2 border-t border-dashed border-zm-border flex justify-center">
              <button type="button" disabled={submitting || resetting} onClick={handleResetCheckIn} className="text-xs font-bold text-amber-300 flex items-center gap-1 py-2">
                <RotateCcw size={12} aria-hidden="true" /> Reset Test Punch
              </button>
            </div>
          )}
        </section>
      )}

      {/* Tasks shortcut */}
      <Link to="/tasks" className="flex items-center justify-between gap-3 rounded-2xl bg-zm-card border border-zm-border px-4 py-3.5">
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-zm-green/20 text-zm-green-light flex items-center justify-center" aria-hidden="true">
            <ListChecks size={18} />
          </span>
          <span>
            <span className="block text-sm font-bold text-zm-text">My Tasks</span>
            <span className="block text-xs text-zm-muted">{tasksLoading ? 'Loading…' : `${openTasks} open`}</span>
          </span>
        </span>
        <ChevronRight size={18} className="text-zm-muted" aria-hidden="true" />
      </Link>

      <ConfirmDialog
        open={confirmCheckoutOpen}
        onClose={() => !submitting && setConfirmCheckoutOpen(false)}
        onConfirm={async () => {
          try {
            await checkOut();
          } finally {
            setConfirmCheckoutOpen(false);
          }
        }}
        title="Confirm Check Out?"
        description="Are you sure you want to check out now? This will complete your attendance session for today."
        confirmLabel="Confirm Checkout"
        variant="primary"
        loading={submitting}
      />
    </div>
  );
}
