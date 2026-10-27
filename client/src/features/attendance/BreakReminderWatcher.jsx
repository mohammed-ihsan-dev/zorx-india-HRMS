import { useEffect, useRef, useState } from 'react';
import { AlarmClock, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import * as attendanceService from '../../services/attendanceService.js';
import { ROLES } from '../../utils/constants.js';
import { useMobileShell } from '../../context/MobileShellContext.jsx';
import {
  BREAK_REMINDER,
  createBreakReminderScheduler,
  createDeliveryStore,
  playReminderSound,
  vibrateForReminder,
  showSystemNotification,
} from './breakReminders.js';

export const ATTENDANCE_RECORD_EVENT = 'zorx:attendance-record';
export const SOUND_PREF_KEY = 'zorx:breakReminderSound';

/** Lets useTodayAttendance share every fresh record with the watcher (no extra requests). */
export function announceAttendanceRecord(record) {
  try {
    window.dispatchEvent(new CustomEvent(ATTENDANCE_RECORD_EVENT, { detail: record ?? null }));
  } catch {
    // ignore
  }
}

export function isReminderSoundOn() {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const REMINDER_TEXT = {
  [BREAK_REMINDER.ENDING_SOON]: {
    title: 'Break Ending Soon',
    message: 'You have 5 minutes remaining in your break. Please prepare to return to work.',
    // Break started with under 5 minutes of the daily allowance left.
    messageFor: (minutes) =>
      minutes >= 5
        ? 'You have 5 minutes remaining in your break. Please prepare to return to work.'
        : `You have ${minutes} minute${minutes === 1 ? '' : 's'} remaining in your break. Please prepare to return to work.`,
  },
  [BREAK_REMINDER.TIME_OVER]: {
    title: 'Break Time Over',
    message: 'Your 1-hour break has ended. Please end your break and return to work.',
  },
};

const REFETCH_MIN_GAP_MS = 60_000;

let localStore = null;
const getStore = () => {
  if (!localStore) {
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    localStore = createDeliveryStore(storage);
  }
  return localStore;
};

/**
 * App-wide, invisible until a reminder is due. Mounted once per layout, so it
 * keeps working while the employee is on any page of the app (not when the
 * browser/tab is closed). Super Admins don't record attendance and are skipped.
 */
export function BreakReminderWatcher() {
  const inMobileShell = useMobileShell(); // keep the banner above the phone bottom nav
  const { user } = useAuth();
  const toast = useToast();
  const [overNotice, setOverNotice] = useState(false);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const userId = user?.id || user?._id || null;
  const enabled = Boolean(userId) && user?.role !== ROLES.SUPER_ADMIN;

  useEffect(() => {
    if (!enabled) return undefined;

    const scheduler = createBreakReminderScheduler({
      userId,
      store: getStore(),
      onBreakInactive: () => setOverNotice(false),
      onReminder: (type, { remainingMs } = {}) => {
        const text = REMINDER_TEXT[type];
        const { title } = text;
        const message = text.messageFor ? text.messageFor(Math.max(1, Math.ceil((remainingMs ?? 0) / 60_000))) : text.message;
        // "Time over" gets the persistent banner below; the 55-min warning is a toast.
        if (type === BREAK_REMINDER.TIME_OVER) {
          setOverNotice(true);
        } else {
          toastRef.current.showToast(
            <>
              <span className="block font-bold">{title}</span>
              <span className="block">{message}</span>
            </>,
            'info',
            15_000
          );
        }
        if (isReminderSoundOn()) playReminderSound(type);
        vibrateForReminder(type);
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') showSystemNotification(title, message);
      },
    });

    let lastFetch = 0;
    let alive = true;
    // Daily allowance from office settings (the same value the End Break countdown uses).
    let allowanceMinutes;
    const fetchRecord = async () => {
      lastFetch = Date.now();
      try {
        const data = await attendanceService.getMyAttendanceToday();
        if (!alive) return;
        allowanceMinutes = data?.officeSettings?.breakDurationMinutes || undefined;
        scheduler.update(data?.attendance ?? null, allowanceMinutes);
      } catch {
        // Network/API failure: keep the last known state.
      }
    };

    const onRecord = (e) => scheduler.update(e.detail, allowanceMinutes);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      scheduler.check(); // catches up after background-tab timer throttling
      if (Date.now() - lastFetch > REFETCH_MIN_GAP_MS) fetchRecord(); // break may have ended on another device
    };

    window.addEventListener(ATTENDANCE_RECORD_EVENT, onRecord);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    fetchRecord();

    return () => {
      alive = false;
      scheduler.stop();
      window.removeEventListener(ATTENDANCE_RECORD_EVENT, onRecord);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      setOverNotice(false);
    };
  }, [enabled, userId]);

  if (!overNotice) return null;
  const { title, message } = REMINDER_TEXT[BREAK_REMINDER.TIME_OVER];
  return (
    <div className={`fixed ${inMobileShell ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+92px)]' : 'bottom-4'} right-4 left-4 sm:left-auto z-[90] sm:w-96 rounded-xl border shadow-popover p-4 flex items-start gap-3 animate-in ${
        inMobileShell ? 'border-rose-400/50 bg-[#3a1d26] text-rose-50' : 'border-rose-200 bg-rose-50 text-rose-900'
      }`} role="alert" aria-live="assertive">
      <AlarmClock size={22} className="shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-bold">{title}</p>
        <p className="text-sm leading-snug mt-0.5">{message}</p>
      </div>
      <button type="button" onClick={() => setOverNotice(false)} className="text-rose-500 hover:text-rose-800 shrink-0" aria-label="Dismiss break reminder">
        <X size={18} />
      </button>
    </div>
  );
}

/** Small opt-in controls shown while on a break: sound on/off and system notifications (asked only on click). */
export function BreakAlertSettings() {
  const [soundOn, setSoundOn] = useState(isReminderSoundOn);
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState(() => (supported ? window.Notification.permission : 'unsupported'));

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_PREF_KEY, next ? 'on' : 'off');
    } catch {
      // ignore
    }
  };

  const askPermission = async () => {
    try {
      setPermission(await window.Notification.requestPermission());
    } catch {
      setPermission('denied');
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
      <span>Reminders at 5 min left and when your daily hour is used</span>
      <button type="button" onClick={toggleSound} aria-pressed={soundOn} className="font-semibold text-brand-800 hover:underline">
        Sound: {soundOn ? 'On' : 'Off'}
      </button>
      {permission === 'default' && (
        <button type="button" onClick={askPermission} className="font-semibold text-brand-800 hover:underline">
          Enable notifications
        </button>
      )}
    </div>
  );
}
