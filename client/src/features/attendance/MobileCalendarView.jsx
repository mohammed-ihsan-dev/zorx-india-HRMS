import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  LayoutList,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  PartyPopper,
} from "lucide-react";
import { MobileStatusPill } from "../../components/MobileStatusPill.jsx";
import * as attendanceService from "../../services/attendanceService.js";
import * as holidayService from "../../services/holidayService.js";
import { getErrorMessage } from "../../services/apiClient.js";
import { useToast } from "../../hooks/useToast.js";
import { MONTH_LABELS, toDateInputValue } from "../../utils/calendarDate.js";
import {
  formatDate,
  formatTime,
  formatMinutes,
} from "../../utils/formatters.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Cell colours follow the app's status colours (STATUS_COLORS): present green,
// late/half-day amber family, absent red, leave blue. Days with no record are
// left neutral — the calendar never guesses a status the server didn't record.
const CELL_TONE = {
  PRESENT: "bg-emerald-500/15 border-emerald-400/40 text-emerald-200",
  LATE: "bg-amber-500/15 border-amber-400/40 text-amber-200",
  HALF_DAY: "bg-orange-500/15 border-orange-400/40 text-orange-200",
  ABSENT: "bg-rose-500/15 border-rose-400/40 text-rose-200",
  LEAVE: "bg-sky-500/15 border-sky-400/40 text-sky-200",
};
const NEUTRAL = "bg-zm-elev/60 border-transparent text-zm-muted";
// Company holiday with no attendance record (a record, if any, always wins).
const HOLIDAY_TONE = "bg-violet-500/15 border-violet-400/40 text-violet-200";

const LEGEND = [
  { label: "Present", dot: "bg-emerald-400" },
  { label: "Late", dot: "bg-amber-400" },
  { label: "Half Day", dot: "bg-orange-400" },
  { label: "Absent", dot: "bg-rose-400" },
  { label: "On Leave", dot: "bg-sky-400" },
  { label: "Holiday", dot: "bg-violet-400" },
];

/** Attendance `date` is stored as UTC midnight of the office (IST) day. */
const recordKey = (r) => new Date(r.date).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, "0");

function localTodayKey() {
  const d = new Date();
  return toDateInputValue(d.getFullYear(), d.getMonth(), d.getDate());
}

/** A past day that was checked into but never checked out. */
const isMissedCheckout = (r, todayKey) =>
  Boolean(r?.checkIn && !r.checkOut && recordKey(r) < todayKey);

/**
 * Phone attendance calendar. Loads one month at a time from the existing
 * history endpoint (GET /attendance/me?from&to) and only displays what the
 * server recorded.
 */
export function MobileCalendarView() {
  const toast = useToast();
  const now = new Date();
  const todayKey = localTodayKey();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState(todayKey);
  const [records, setRecords] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const last = new Date(year, month + 1, 0).getDate();
    const range = {
      from: `${year}-${pad(month + 1)}-01`,
      to: `${year}-${pad(month + 1)}-${pad(last)}`,
    };
    setLoading(true);
    // Holidays are extra context: if they fail to load, attendance still shows.
    holidayService
      .listHolidays(range)
      .then((list) => alive && setHolidays(list || []))
      .catch(() => alive && setHolidays([]));
    attendanceService
      .getMyAttendanceHistory({ ...range, limit: 31 })
      .then((res) => alive && setRecords(res.data || []))
      .catch((err) => {
        if (!alive) return;
        setRecords([]);
        toast.error(getErrorMessage(err, "Could not load attendance."));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [year, month, toast]);

  const byDay = useMemo(
    () => new Map(records.map((r) => [recordKey(r), r])),
    [records],
  );
  const holidayByDay = useMemo(
    () => new Map(holidays.map((h) => [recordKey(h), h])),
    [holidays],
  );

  const weeks = useMemo(() => {
    const days = new Date(year, month + 1, 0).getDate();
    const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
    const cells = [
      ...Array(lead).fill(null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, i) =>
      cells.slice(i * 7, i * 7 + 7),
    );
  }, [year, month]);

  const go = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const missed = records.filter((r) => isMissedCheckout(r, todayKey));
  const selectedRecord = byDay.get(selected);
  const selectedHoliday = holidayByDay.get(selected);
  // List view: attendance records plus holidays that have no record, newest first.
  const sorted = [
    ...records,
    ...holidays
      .filter((h) => !byDay.has(recordKey(h)))
      .map((h) => ({ ...h, isHoliday: true })),
  ].sort((a, b) => (recordKey(a) < recordKey(b) ? 1 : -1));

  const toggleClass = (active) =>
    `w-10 h-9 rounded-full flex items-center justify-center ${active ? "bg-zm-elev text-zm-green-light" : "text-zm-muted"}`;

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-zm-text tracking-tight">
          Calendar
        </h1>
        <div
          className="flex p-1 rounded-full bg-zm-card border border-zm-border"
          role="group"
          aria-label="View"
        >
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label="Calendar view"
            className={toggleClass(view === "grid")}
          >
            <CalendarDays size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
            className={toggleClass(view === "list")}
          >
            <LayoutList size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Stays pinned to the top of the shell's scroll area (EmployeeLayout's <main>);
          the bleed + opaque background keep scrolled cards from showing through. */}
      <div className="sticky -top-3 z-10 -mx-4 px-4 py-2 -my-2 bg-zm-bg flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous month"
          className="w-11 h-11 rounded-full bg-zm-card border border-zm-border text-zm-green-light flex items-center justify-center"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <p className="text-lg font-bold text-zm-text" aria-live="polite">
          {MONTH_LABELS[month]} {year}
        </p>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next month"
          className="w-11 h-11 rounded-full bg-zm-card border border-zm-border text-zm-green-light flex items-center justify-center"
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>

      {view === "grid" ? (
        <>
          <div
            className={`rounded-3xl bg-zm-card border border-zm-border p-3 transition-opacity ${loading ? "opacity-60" : ""}`}
            aria-busy={loading}
          >
            <div className="grid grid-cols-7 gap-1.5 text-center mb-1.5">
              {WEEKDAYS.map((w) => (
                <span
                  key={w}
                  className="text-xs font-semibold text-zm-muted py-1"
                >
                  {w}
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1.5">
                  {week.map((day, di) => {
                    if (!day) return <span key={di} />;
                    const key = toDateInputValue(year, month, day);
                    const r = byDay.get(key);
                    const missedOut = isMissedCheckout(r, todayKey);
                    const holiday = holidayByDay.get(key);
                    const tone = r
                      ? CELL_TONE[r.status] || NEUTRAL
                      : holiday
                        ? HOLIDAY_TONE
                        : NEUTRAL;
                    const isToday = key === todayKey;
                    const isSelected = key === selected;
                    return (
                      <button
                        key={di}
                        type="button"
                        onClick={() => setSelected(key)}
                        aria-pressed={isSelected}
                        aria-label={`${day} ${MONTH_LABELS[month]}${holiday ? `, holiday: ${holiday.name}` : ""}${r ? `, ${r.status.replace("_", " ").toLowerCase()}` : ""}${missedOut ? ", missed check-out" : ""}${isToday ? ", today" : ""}`}
                        className={`relative aspect-square rounded-xl border text-sm font-bold flex items-center justify-center ${tone} ${
                          isSelected
                            ? "ring-2 ring-zm-green-light ring-offset-2 ring-offset-zm-card"
                            : isToday
                              ? "!border-zm-green-light !border-2"
                              : ""
                        }`}
                      >
                        {day}
                        {missedOut && (
                          <AlertTriangle
                            size={10}
                            className="absolute bottom-1 right-1 text-amber-300"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <ul className="flex flex-wrap gap-1.5" aria-label="Legend">
            <li className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-zm-card border border-zm-border text-xs text-zm-muted">
              <span
                className="w-2.5 h-2.5 rounded-full border-2 border-zm-green-light"
                aria-hidden="true"
              />{" "}
              Today
            </li>
            {LEGEND.map((l) => (
              <li
                key={l.label}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-zm-card border border-zm-border text-xs text-zm-muted"
              >
                <span
                  className={`w-2 h-2 rounded-full ${l.dot}`}
                  aria-hidden="true"
                />{" "}
                {l.label}
              </li>
            ))}
            <li className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-zm-card border border-zm-border text-xs text-zm-muted">
              <AlertTriangle
                size={12}
                className="text-amber-300"
                aria-hidden="true"
              />{" "}
              Missed check-out
            </li>
          </ul>

          <section
            aria-label="Selected day"
            className="rounded-2xl bg-zm-card border border-zm-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-zm-text">
                {formatDate(`${selected}T00:00:00`, {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              {selectedRecord && (
                <MobileStatusPill status={selectedRecord.status} />
              )}
            </div>
            {selectedHoliday && (
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-200 bg-violet-500/10 border border-violet-400/30 px-3 py-2 rounded-xl">
                <PartyPopper
                  size={16}
                  className="shrink-0"
                  aria-hidden="true"
                />{" "}
                Holiday · {selectedHoliday.name}
              </p>
            )}
            {selectedRecord ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {[
                  [
                    "Check In",
                    selectedRecord.checkIn
                      ? formatTime(selectedRecord.checkIn.timestamp)
                      : "—",
                  ],
                  [
                    "Check Out",
                    selectedRecord.checkOut
                      ? formatTime(selectedRecord.checkOut.timestamp)
                      : "—",
                  ],
                  [
                    "Working Hours",
                    selectedRecord.checkOut
                      ? formatMinutes(selectedRecord.totalWorkingMinutes)
                      : "—",
                  ],
                  ["Break", formatMinutes(selectedRecord.breakMinutes)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-zm-elev px-3 py-2">
                    <dt className="text-[11px] text-zm-muted">{label}</dt>
                    <dd className="font-bold text-zm-text">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              !selectedHoliday && (
                <p className="text-sm text-zm-muted">
                  {loading
                    ? "Loading…"
                    : "No attendance recorded for this day."}
                </p>
              )
            )}
            {isMissedCheckout(selectedRecord, todayKey) && (
              <p className="flex items-start gap-2 text-xs font-semibold text-amber-200 bg-amber-500/10 border border-amber-400/30 p-2.5 rounded-xl">
                <AlertTriangle
                  size={14}
                  className="shrink-0 mt-px"
                  aria-hidden="true"
                />{" "}
                No check-out was recorded for this day.
              </p>
            )}
          </section>

          {missed.length > 0 && (
            <p className="text-xs text-zm-muted text-center">
              {missed.length} day{missed.length > 1 ? "s" : ""} this month
              without a check-out.
            </p>
          )}
        </>
      ) : (
        <ul className="space-y-2.5" aria-busy={loading}>
          {loading ? (
            [1, 2, 3].map((i) => (
              <li
                key={i}
                className="h-20 rounded-2xl bg-zm-card animate-pulse"
              />
            ))
          ) : sorted.length === 0 ? (
            <li className="rounded-2xl bg-zm-card border border-zm-border p-8 text-center text-sm text-zm-muted">
              No attendance recorded this month.
            </li>
          ) : (
            sorted.map((r) =>
              r.isHoliday ? (
                <li
                  key={r._id}
                  className="rounded-2xl bg-violet-500/10 border border-violet-400/30 p-3.5 flex items-center justify-between gap-2"
                >
                  <span className="text-sm font-bold text-zm-text">
                    {formatDate(`${recordKey(r)}T00:00:00`, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-200">
                    <PartyPopper size={14} aria-hidden="true" /> Holiday ·{" "}
                    {r.name}
                  </span>
                </li>
              ) : (
                <li
                  key={r._id}
                  className="rounded-2xl bg-zm-card border border-zm-border p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-zm-text">
                      {formatDate(`${recordKey(r)}T00:00:00`, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {isMissedCheckout(r, todayKey) && (
                        <AlertTriangle
                          size={14}
                          className="text-amber-300"
                          aria-label="Missed check-out"
                        />
                      )}
                      <MobileStatusPill status={r.status} />
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <div>
                      <dt className="text-zm-muted">In</dt>
                      <dd className="font-semibold text-zm-text">
                        {r.checkIn ? formatTime(r.checkIn.timestamp) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zm-muted">Out</dt>
                      <dd className="font-semibold text-zm-text">
                        {r.checkOut ? formatTime(r.checkOut.timestamp) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zm-muted">Worked</dt>
                      <dd className="font-semibold text-zm-green-light">
                        {r.checkOut
                          ? formatMinutes(r.totalWorkingMinutes)
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </li>
              ),
            )
          )}
        </ul>
      )}
    </div>
  );
}
