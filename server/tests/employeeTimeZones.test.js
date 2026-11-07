import { EMPLOYEE_DISPLAY_TIME_ZONES, displayTimeZoneFor, timeZoneLabel } from '../src/config/employeeTimeZones.js';
import { buildCalendarMonth, buildSalaryRows, monthRange } from '../src/services/salaryReportService.js';
import { buildAttendanceCalendar } from '../src/services/attendanceCalendarService.js';

const RIFAN = '6adf17303c9ddd5f303eef7a';
const TZ = 'Asia/Kolkata';
const day = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const ist = (ymd, hms) => new Date(`${ymd}T${hms}+05:30`);
// 7 Nov 2026: in at 13:11 IST (11:41 Dubai), out at 21:30 IST (20:00 Dubai).
const rec = (emp) => ({ date: day('2026-11-07'), status: 'LATE', employeeId: emp, checkIn: { timestamp: ist('2026-11-07', '13:11:00') }, checkOut: { timestamp: ist('2026-11-07', '21:30:00') } });
const rifan = { _id: RIFAN, firstName: 'MUHAMMED', lastName: 'RIFAN', joiningDate: day('2026-08-28'), overtimeCutoffTime: '20:30', workingEndTime: '19:30' };
const other = { _id: '64b000000000000000000000', firstName: 'Asha', lastName: 'K', joiningDate: day('2026-01-01') };
const cell = (cal) => cal.weeks.flat().find((c) => c?.dateKey === '2026-11-07');
const today = ist('2026-11-20', '12:00:00');

test('only Rifan is shown in Dubai time; everyone else keeps India time', () => {
  expect(EMPLOYEE_DISPLAY_TIME_ZONES).toEqual({ [RIFAN]: 'Asia/Dubai' });
  expect(displayTimeZoneFor(RIFAN, TZ)).toBe('Asia/Dubai');
  expect(displayTimeZoneFor({ _id: RIFAN }, TZ)).toBe('Asia/Dubai');
  expect(displayTimeZoneFor(other._id, TZ)).toBe(TZ);
  expect(timeZoneLabel('Asia/Dubai', TZ)).toBe('Dubai time');
  expect(timeZoneLabel(TZ, TZ)).toBeNull();
});

test('Salary calendar and rows: Rifan in Dubai time with a label; overtime and days unchanged', () => {
  const r = buildCalendarMonth({ range: monthRange('2026-11'), records: [rec(rifan)], employee: rifan, officeSettings: { overtimeEnabled: true }, today, timeZone: TZ });
  expect(r.timeZoneLabel).toBe('Dubai time');
  expect(cell(r)).toMatchObject({ checkIn: '11:41 AM', checkOut: '08:00 PM', overtimeMinutes: 120 }); // 8 PM Dubai → 2h (rule unchanged)
  const o = buildCalendarMonth({ range: monthRange('2026-11'), records: [rec(other)], employee: other, officeSettings: { overtimeEnabled: true }, today, timeZone: TZ });
  expect(o.timeZoneLabel).toBeNull();
  expect(cell(o)).toMatchObject({ checkIn: '01:11 PM', checkOut: '09:30 PM' });
  const rows = buildSalaryRows([rec(rifan), rec(other)], { overtimeEnabled: true }, TZ);
  expect(rows.map((x) => [x.employeeName, x.checkIn, x.timeZoneLabel])).toEqual([
    ['Asha K', '01:11 PM', null],
    ['MUHAMMED RIFAN', '11:41 AM', 'Dubai time'],
  ]);
});

test('Attendance calendar: same rule', () => {
  const c = buildAttendanceCalendar({ range: monthRange('2026-11'), employee: rifan, records: [rec(rifan)], officeSettings: { overtimeEnabled: true }, today, timeZone: TZ });
  expect(c.timeZoneLabel).toBe('Dubai time');
  expect(cell(c)).toMatchObject({ checkIn: '11:41 AM', checkOut: '08:00 PM', hasOvertime: true, status: 'LATE' });
});

test('Salary CSV keeps its columns; Rifan\'s cells say Dubai', async () => {
  const { SALARY_COLUMNS } = await import('../src/services/salaryReportService.js');
  expect(SALARY_COLUMNS.map((c) => c.label)).toEqual(['Employee Name', 'Date', 'Check-in Time', 'Check-out Time', 'Overtime Used']);
  const [asha, rif] = buildSalaryRows([rec(rifan), rec(other)], { overtimeEnabled: true }, TZ);
  expect(SALARY_COLUMNS[2].value(rif)).toBe('11:41 AM (Dubai)');
  expect(SALARY_COLUMNS[2].value(asha)).toBe('01:11 PM');
});
