import { useState } from 'react';
import { MapPin, CheckCircle2, XCircle, LoaderCircle, AlertTriangle, Radio, Clock, Coffee } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { formatTime, formatMeters, titleCase } from '../../utils/formatters.js';
import { ATTENDANCE_UI_STATE } from './useTodayAttendance.js';
import { LOCATION_STATUS } from '../../hooks/useGeolocation.js';

const BREAK_TYPES = ['TEA', 'WASHROOM', 'LUNCH', 'PERSONAL', 'OTHER'];

export function AttendanceWidget({ data }) {
  const {
    loading,
    submitting,
    record,
    uiState,
    geolocation,
    locationStatus,
    checkIn,
    checkOut,
    activeBreak,
    breakSubmitting,
    startBreak,
    endBreak,
  } = data;
  const [breakModalOpen, setBreakModalOpen] = useState(false);

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

      <div className="grid grid-cols-2 gap-6 mb-6 bg-slate-50/80 p-5 rounded-2xl border border-slate-100">
        <TimeStat label="Check In" value={record?.checkIn ? formatTime(record.checkIn.timestamp) : null} accent="brand" />
        <TimeStat label="Check Out" value={record?.checkOut ? formatTime(record.checkOut.timestamp) : null} accent="neutral" />
      </div>

      <div className="mb-6 space-y-4">
        {uiState === ATTENDANCE_UI_STATE.NOT_CHECKED_IN && (
          <StateBlock
            icon={MapPin}
            iconTone="brand"
            title="Ready for Check-In"
            subtitle="GPS location verification is required to mark attendance."
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
            title={`On Break — ${titleCase(activeBreak.type)}`}
            subtitle="End your break to resume working and check out."
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

        {locationStatus && (
          <div
            className={`flex items-center gap-2.5 p-3.5 rounded-xl text-base font-semibold border ${
              locationStatus.inside
                ? 'bg-brand-50 text-brand-900 border-brand-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {locationStatus.inside ? (
              <CheckCircle2 size={20} className="shrink-0 text-brand-700" />
            ) : (
              <XCircle size={20} className="shrink-0 text-red-600" />
            )}
            <span className="text-sm sm:text-base">
              {locationStatus.inside ? '✓ Location Verified' : 'Outside Attendance Area'} ·{' '}
              {formatMeters(locationStatus.distance)} from office
            </span>
          </div>
        )}
      </div>

      {transientBanner && <div className="mb-6">{transientBanner}</div>}

      <div className="mt-auto">
        {uiState === ATTENDANCE_UI_STATE.NOT_CHECKED_IN && (
          <Button
            variant="primary"
            size="lg"
            className="w-full text-lg sm:text-xl py-4 min-h-[54px] shadow-md hover:bg-brand-900 font-extrabold tracking-wide"
            icon={MapPin}
            loading={submitting}
            onClick={checkIn}
          >
            CHECK IN NOW
          </Button>
        )}
        {uiState === ATTENDANCE_UI_STATE.WORKING && (
          <>
            <Button
              variant="danger"
              size="lg"
              className="w-full text-lg sm:text-xl py-4 min-h-[54px] shadow-md font-extrabold tracking-wide"
              icon={MapPin}
              loading={submitting}
              onClick={checkOut}
            >
              CHECK OUT NOW
            </Button>
            <button
              type="button"
              onClick={() => setBreakModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 mt-3 text-sm font-semibold text-slate-500 hover:text-brand-700"
            >
              <Coffee size={14} /> Start Break
            </button>
          </>
        )}
        {uiState === ATTENDANCE_UI_STATE.ON_BREAK && (
          <Button
            variant="secondary"
            size="lg"
            className="w-full text-lg sm:text-xl py-4 min-h-[54px] font-extrabold tracking-wide"
            icon={Coffee}
            loading={breakSubmitting}
            onClick={endBreak}
          >
            END BREAK
          </Button>
        )}
        {uiState === ATTENDANCE_UI_STATE.COMPLETED && (
          <div className="w-full text-center py-4 rounded-xl bg-brand-100 text-brand-900 font-extrabold text-lg border border-brand-200 shadow-2xs">
            ✓ Attendance Completed Today
          </div>
        )}
      </div>

      <Modal open={breakModalOpen} onClose={() => setBreakModalOpen(false)} title="Start Break" size="sm">
        <p className="text-sm text-slate-500 mb-4">Select a reason for your break.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {BREAK_TYPES.map((type) => (
            <Button
              key={type}
              variant="outline"
              loading={breakSubmitting}
              onClick={async () => {
                await startBreak(type);
                setBreakModalOpen(false);
              }}
            >
              {titleCase(type)}
            </Button>
          ))}
        </div>
      </Modal>
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
