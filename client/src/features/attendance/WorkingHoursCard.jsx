import { Clock } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { CircularProgress } from '../../components/CircularProgress.jsx';
import { formatMinutes } from '../../utils/formatters.js';
import { ATTENDANCE_UI_STATE } from './useTodayAttendance.js';

export function WorkingHoursCard({ data }) {
  const { loading, uiState, workedMinutes, requiredMinutes, remainingMinutes, overtimeMinutes, progressPercent, breakRemainingMinutes, maxBreakMinutes } = data;

  if (loading) {
    return <Card className="h-full min-h-[320px] animate-pulse" />;
  }

  const notStarted = uiState === ATTENDANCE_UI_STATE.NOT_CHECKED_IN;
  const completed = uiState === ATTENDANCE_UI_STATE.COMPLETED;

  return (
    <Card className="h-full flex flex-col">
      <div className="mb-5">
        <p className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Clock size={15} /> Working Hours
        </p>
        <p className="text-sm text-slate-400 mt-1">{formatMinutes(requiredMinutes)} required</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-2">
        <CircularProgress percent={notStarted ? 0 : progressPercent} trackColor="#eef2ee" progressColor={completed ? '#1f5138' : '#3f7a33'}>
          {notStarted ? (
            <>
              <span className="text-sm font-bold text-slate-400">Not started</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-extrabold text-slate-900 leading-none">{formatMinutes(workedMinutes)}</span>
              <span className="text-xs text-slate-400 mt-1">of {formatMinutes(requiredMinutes)}</span>
            </>
          )}
        </CircularProgress>

        <div className="grid grid-cols-2 gap-4 w-full mt-6">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Break Remaining</p>
            <p className="text-lg font-extrabold text-slate-900 mt-1">{formatMinutes(breakRemainingMinutes ?? maxBreakMinutes ?? 60)}</p>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">(Max 1 hr)</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{overtimeMinutes > 0 ? 'Overtime' : 'Remaining'}</p>
            <p className={`text-lg font-extrabold mt-1 ${overtimeMinutes > 0 ? 'text-amber-600' : 'text-brand-800'}`}>
              {notStarted ? formatMinutes(requiredMinutes) : overtimeMinutes > 0 ? `+${formatMinutes(overtimeMinutes)}` : formatMinutes(remainingMinutes)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
