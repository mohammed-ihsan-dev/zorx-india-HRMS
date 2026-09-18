import { useState } from 'react';
import { MapPin, CheckCircle2, LoaderCircle, AlertTriangle, Radio, Clock, Coffee, LogOut, Play } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { formatTime } from '../../utils/formatters.js';
import { ATTENDANCE_UI_STATE } from './useTodayAttendance.js';
import { LOCATION_STATUS } from '../../hooks/useGeolocation.js';

export function AttendanceWidget({ data }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const {
    loading,
    submitting,
    record,
    uiState,
    geolocation,
    checkIn,
    checkOut,
    breakSubmitting,
    startBreak,
    endBreak,
    breakCountdownStr,
  } = data;

  if (loading) {
    return <Card className="h-full min-h-[360px] animate-pulse bg-slate-100" />;
  }

  const transientBanner = (() => {
    if (submitting && geolocation.status === LOCATION_STATUS.CHECKING_LOCATION) {
      return (
        <Banner tone="neutral" icon={LoaderCircle} spin>
          Checking your GPS location…
        </Banner>
      );
    }
    if (
      [LOCATION_STATUS.LOCATION_PERMISSION_DENIED, LOCATION_STATUS.LOCATION_UNAVAILABLE, LOCATION_STATUS.LOCATION_ERROR].includes(
        geolocation.status
      )
    ) {
      return (
        <Banner tone="danger" icon={AlertTriangle}>
          {geolocation.errorMessage}
        </Banner>
      );
    }
    return null;
  })();

  return (
    <Card className="h-full flex flex-col border-brand-200/80 shadow-md relative overflow-hidden bg-gradient-to-b from-white via-white to-brand-50/20">
      {/* Widget Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-800 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-xs uppercase font-extrabold tracking-wider text-slate-500">Today&apos;s Attendance</p>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-none mt-0.5">Punch Station</h3>
          </div>
        </div>
        {record?.status && <StatusBadge status={record.status} />}
      </div>

      {/* Check In / Out Time Stats */}
      <div className="grid grid-cols-2 gap-6 mb-6 bg-slate-50/80 p-5 rounded-2xl border border-slate-100">
        <TimeStat label="Check In" value={record?.checkIn ? formatTime(record.checkIn.timestamp) : null} accent="brand" />
        <TimeStat label="Check Out" value={record?.checkOut ? formatTime(record.checkOut.timestamp) : null} accent="neutral" />
      </div>

      {/* Status Info Block */}
      <div className="mb-4">
        {uiState === ATTENDANCE_UI_STATE.NOT_CHECKED_IN && (
          <StateBlock
            icon={MapPin}
            iconTone="brand"
            title="Ready for Check-In"
            subtitle="Press the Check In button below to log your attendance."
          />
        )}
        {uiState === ATTENDANCE_UI_STATE.WORKING && (
          <StateBlock
            icon={Radio}
            iconTone="live"
            title="Currently Checked In & Working"
            subtitle={`Punched in at ${formatTime(record.checkIn.timestamp)}`}
          />
        )}
        {uiState === ATTENDANCE_UI_STATE.ON_BREAK && (
          <StateBlock
            icon={Coffee}
            iconTone="live"
            title="On Break"
            subtitle="Press End Break to resume your work timer."
          />
        )}
        {uiState === ATTENDANCE_UI_STATE.COMPLETED && (
          <StateBlock
            icon={CheckCircle2}
            iconTone="success"
            title="Attendance Completed"
            subtitle="Great work today! Enjoy your evening."
          />
        )}
      </div>

      {transientBanner && <div className="mb-4">{transientBanner}</div>}

      {/* Round Circular Action Buttons */}
      <div className="mt-auto py-4 flex items-center justify-center min-h-[160px]">
        {uiState === ATTENDANCE_UI_STATE.NOT_CHECKED_IN && (
          <button
            type="button"
            disabled={submitting}
            onClick={checkIn}
            className="w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 text-white font-extrabold shadow-xl shadow-brand-950/30 hover:scale-105 active:scale-95 transition-all duration-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer ring-4 ring-brand-100 hover:ring-brand-200 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <LoaderCircle size={32} className="animate-spin" />
            ) : (
              <>
                <MapPin size={30} />
                <span className="text-base sm:text-lg tracking-wider uppercase">Check In</span>
              </>
            )}
          </button>
        )}

        {uiState === ATTENDANCE_UI_STATE.WORKING && (
          <div className="flex items-center justify-center gap-6 sm:gap-10">
            {/* Direct Start Break Circle Button */}
            <button
              type="button"
              disabled={breakSubmitting}
              onClick={() => startBreak('TEA')}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-white font-extrabold shadow-lg shadow-amber-500/30 hover:scale-105 active:scale-95 transition-all duration-200 flex flex-col items-center justify-center gap-1 cursor-pointer ring-4 ring-amber-100 hover:ring-amber-200 disabled:opacity-50 disabled:pointer-events-none"
            >
              {breakSubmitting ? (
                <LoaderCircle size={28} className="animate-spin" />
              ) : (
                <>
                  <Coffee size={26} />
                  <span className="text-xs sm:text-sm font-black tracking-wide uppercase text-center leading-tight">
                    Start<br />Break
                  </span>
                </>
              )}
            </button>

            {/* Check Out Circle Button */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmOpen(true)}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-rose-600 to-rose-700 text-white font-extrabold shadow-lg shadow-rose-600/30 hover:scale-105 active:scale-95 transition-all duration-200 flex flex-col items-center justify-center gap-1 cursor-pointer ring-4 ring-rose-100 hover:ring-rose-200 disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? (
                <LoaderCircle size={28} className="animate-spin" />
              ) : (
                <>
                  <LogOut size={26} />
                  <span className="text-xs sm:text-sm font-black tracking-wide uppercase text-center leading-tight">
                    Check<br />Out
                  </span>
                </>
              )}
            </button>
          </div>
        )}

        {uiState === ATTENDANCE_UI_STATE.ON_BREAK && (
          <button
            type="button"
            disabled={breakSubmitting}
            onClick={endBreak}
            className="w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 text-white font-extrabold shadow-xl shadow-emerald-600/30 hover:scale-105 active:scale-95 transition-all duration-200 flex flex-col items-center justify-center gap-1 cursor-pointer ring-4 ring-emerald-100 hover:ring-emerald-200 disabled:opacity-50 disabled:pointer-events-none"
          >
            {breakSubmitting ? (
              <LoaderCircle size={32} className="animate-spin" />
            ) : (
              <>
                <Play size={22} fill="currentColor" />
                <span className="text-xs font-black tracking-wider uppercase text-center leading-tight">
                  End Break
                </span>
                <span className="text-lg sm:text-xl font-black tabular-nums tracking-tight text-emerald-100 mt-0.5">
                  {breakCountdownStr || '60:00'}
                </span>
              </>
            )}
          </button>
        )}

        {uiState === ATTENDANCE_UI_STATE.COMPLETED && (
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-brand-50 border-4 border-brand-600 text-brand-900 flex flex-col items-center justify-center text-center font-black p-3 shadow-sm">
            <CheckCircle2 size={32} className="text-brand-700 mb-1" />
            <span className="text-xs uppercase tracking-wider leading-tight">Done for<br />Today</span>
          </div>
        )}
      </div>

      {/* Confirmation Modal before Check Out */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        onConfirm={async () => {
          try {
            await checkOut();
          } finally {
            setConfirmOpen(false);
          }
        }}
        title="Confirm Check Out?"
        description="Are you sure you want to check out now? Once checked out, this action cannot be undone for the current attendance session."
        confirmLabel="Confirm Checkout"
        variant="primary"
        loading={submitting}
      />
    </Card>
  );
}

function TimeStat({ label, value, accent }) {
  const color = accent === 'brand' ? 'text-brand-800' : 'text-slate-900';
  return (
    <div>
      <p className="text-xs uppercase font-extrabold tracking-wide text-slate-500 mb-1">{label}</p>
      <p className={`text-3xl sm:text-4xl font-black tracking-tight ${value ? color : 'text-slate-300'}`}>
        {value || '--:--'}
      </p>
    </div>
  );
}

function StateBlock({ icon: Icon, iconTone, title, subtitle }) {
  const toneClasses = {
    brand: 'bg-brand-100 text-brand-800 border-brand-200',
    live: 'bg-amber-100 text-amber-800 border-amber-200',
    success: 'bg-brand-100 text-brand-800 border-brand-200',
  };
  return (
    <div className="flex items-start gap-3.5">
      <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 shadow-2xs ${toneClasses[iconTone]}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{title}</p>
        <p className="text-sm sm:text-base text-slate-600 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function Banner({ icon: Icon, tone, spin, children }) {
  const toneClasses = tone === 'danger' ? 'text-red-800 bg-red-50 border-red-200' : 'text-slate-700 bg-slate-50 border-slate-200';
  return (
    <div className={`flex items-center gap-3 text-base font-semibold rounded-xl px-4 py-3.5 border ${toneClasses}`}>
      <Icon size={20} className={`shrink-0 ${spin ? 'animate-spin' : ''}`} />
      <span>{children}</span>
    </div>
  );
}
