import { Clock, Coffee, LogOut, MapPin, Play } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { formatTime, titleCase } from '../../utils/formatters.js';

export function getTodayTimelineEvents(record) {
  if (!record) return [];

  const events = [];

  if (record.checkIn?.timestamp) {
    events.push({
      id: 'check-in',
      label: 'CHECK IN',
      time: record.checkIn.timestamp,
      tone: 'green',
      icon: MapPin,
    });
  }

  if (Array.isArray(record.breaks)) {
    record.breaks.forEach((b, index) => {
      if (b.startTime) {
        events.push({
          id: `break-start-${index}`,
          label: 'BREAK',
          breakType: b.type,
          time: b.startTime,
          tone: 'red',
          icon: Coffee,
        });
      }
      if (b.endTime) {
        events.push({
          id: `break-end-${index}`,
          label: 'BREAK END',
          breakType: b.type,
          time: b.endTime,
          tone: 'green',
          icon: Play,
        });
      }
    });
  }

  if (record.checkOut?.timestamp) {
    events.push({
      id: 'check-out',
      label: 'CHECK OUT',
      time: record.checkOut.timestamp,
      tone: 'red',
      icon: LogOut,
    });
  }

  return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export function TodayAttendanceTimeline({ record, loading }) {
  if (loading) {
    return <Card className="rounded-3xl border border-slate-200/90 p-6 sm:p-8 animate-pulse bg-slate-100 min-h-[160px]" />;
  }

  const events = getTodayTimelineEvents(record);

  return (
    <Card className="rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 bg-white">
      <div className="flex items-center gap-2.5 mb-5 border-b border-slate-100 pb-4">
        <div className="w-8 h-8 rounded-xl bg-brand-100 text-brand-800 flex items-center justify-center shrink-0">
          <Clock size={18} />
        </div>
        <div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Today&apos;s Attendance</h3>
          <p className="text-sm text-slate-500 mt-0.5">Visual timeline of check-in, break, and check-out events for today.</p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="py-6 text-center text-slate-500">
          <p className="text-base font-semibold text-slate-600">No attendance activity yet.</p>
          <p className="text-xs text-slate-400 mt-1">Check in from the punch station to log today&apos;s attendance timeline.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {events.map((evt) => {
            const isGreen = evt.tone === 'green';
            const Icon = evt.icon;

            return (
              <div
                key={evt.id}
                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                  isGreen
                    ? 'bg-gradient-to-br from-emerald-50/70 via-white to-white border-emerald-200/90 shadow-2xs hover:border-emerald-300'
                    : 'bg-gradient-to-br from-rose-50/70 via-white to-white border-rose-200/90 shadow-2xs hover:border-rose-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight tabular-nums">
                    {formatTime(evt.time)}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                      isGreen ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    <Icon size={15} />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100/80">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isGreen ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                  <span className={`text-xs font-black uppercase tracking-wider ${isGreen ? 'text-emerald-800' : 'text-rose-800'}`}>
                    {evt.label}
                  </span>
                  {evt.breakType && (
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60 ml-auto">
                      {titleCase(evt.breakType)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
