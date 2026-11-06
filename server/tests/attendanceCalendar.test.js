import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { Leave } from '../src/models/Leave.js';
import { Holiday } from '../src/models/Holiday.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { classifyDay, buildAttendanceCalendar, DAY_STATUS } from '../src/services/attendanceCalendarService.js';
import { monthRange, buildCalendarMonth } from '../src/services/salaryReportService.js';
import { ROLES } from '../src/utils/constants.js';

const TZ = 'Asia/Kolkata';
const day = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const ist = (ymd, hms) => new Date(`${ymd}T${hms}+05:30`);
const TODAY = ist('2026-10-20', '15:00:00'); // a Tuesday afternoon
const rec = (ymd, status, inT = '09:30:00', outT = '18:00:00') => ({ date: day(ymd), status, checkIn: inT ? { timestamp: ist(ymd, inT) } : null, checkOut: outT ? { timestamp: ist(ymd, outT) } : null });
const leave = (start, end, leaveType, status = 'APPROVED', duration = 'FULL_DAY') => ({ leaveType, status, startDate: day(start), endDate: day(end), duration });
const office = { overtimeEnabled: true };
const cal = (opts) => buildAttendanceCalendar({ range: monthRange('2026-10'), employee: { _id: 'e1', firstName: 'Asha', lastName: 'K', joiningDate: day('2026-01-01') }, officeSettings: office, today: TODAY, timeZone: TZ, ...opts });
const cellOf = (c, ymd) => c.weeks.flat().find((x) => x?.dateKey === ymd);
const classify = (o) => classifyDay({ weekday: 3, todayKey: '2026-10-20', holiday: null, record: null, leaves: [], joiningKey: '2026-01-01', ...o });

describe('calendar layout (shared with the Salary Report)', () => {
  test('Monday-first weeks, correct weekday alignment, empty cells outside the month', () => {
    const c = cal({});
    expect(c.weeks[0].slice(0, 3)).toEqual([null, null, null]); // 1 Oct 2026 is a Thursday
    expect(c.weeks[0][3]).toMatchObject({ day: 1, dateKey: '2026-10-01' });
    expect(c.weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(c.weeks.every((w) => w.length === 7)).toBe(true);
    expect(cellOf(c, '2026-10-04').isSunday).toBe(true);
  });

  test('the Salary Report calendar is unchanged by the shared grid', () => {
    const salary = buildCalendarMonth({ range: monthRange('2026-10'), records: [rec('2026-10-05', 'PRESENT')], employee: { _id: 'e1', firstName: 'A' }, today: TODAY, timeZone: TZ });
    expect(salary.weeks.map((w) => w.map((c) => c?.dateKey || null))).toEqual(cal({}).weeks.map((w) => w.map((c) => c?.dateKey || null)));
    expect(cellOf(salary, '2026-10-05')).toMatchObject({ kind: 'record', checkIn: '09:30 AM', checkOut: '06:00 PM' });
  });
});

describe('status per day (priority: leave → absent → half day → late → present)', () => {
  test('Late, Half Day and Present come from the stored attendance status (existing rules)', () => {
    expect(classify({ dateKey: '2026-10-06', record: rec('2026-10-06', 'LATE') }).status).toBe(DAY_STATUS.LATE);
    expect(classify({ dateKey: '2026-10-06', record: rec('2026-10-06', 'HALF_DAY') }).status).toBe(DAY_STATUS.HALF_DAY);
    expect(classify({ dateKey: '2026-10-06', record: rec('2026-10-06', 'PRESENT') }).status).toBe(DAY_STATUS.PRESENT);
  });

  test('approved Sick / Casual / Paid leave show as that leave, never Absent', () => {
    expect(classify({ dateKey: '2026-10-06', leaves: [leave('2026-10-06', '2026-10-06', 'SICK')] }).status).toBe(DAY_STATUS.SICK_LEAVE);
    expect(classify({ dateKey: '2026-10-07', leaves: [leave('2026-10-06', '2026-10-08', 'CASUAL')] }).status).toBe(DAY_STATUS.CASUAL_LEAVE);
    expect(classify({ dateKey: '2026-10-06', leaves: [leave('2026-10-06', '2026-10-06', 'PAID')] }).status).toBe(DAY_STATUS.PAID_LEAVE);
  });

  test('approved leave wins over a check-in; a full-day one is flagged, a half-day one is not', () => {
    const full = classify({ dateKey: '2026-10-06', record: rec('2026-10-06', 'PRESENT'), leaves: [leave('2026-10-06', '2026-10-06', 'CASUAL')] });
    expect(full).toMatchObject({ status: DAY_STATUS.CASUAL_LEAVE, conflict: expect.stringMatching(/full-day approved leave/) });
    const half = classify({ dateKey: '2026-10-06', record: rec('2026-10-06', 'HALF_DAY'), leaves: [leave('2026-10-06', '2026-10-06', 'CASUAL', 'APPROVED', 'HALF_DAY')] });
    expect(half).toMatchObject({ status: DAY_STATUS.CASUAL_LEAVE, leaveHalfDay: true, conflict: null });
  });
});

describe('automatic absence (derived, never stored)', () => {
  test('a completed working day with no attendance and no leave is Absent', () => {
    expect(classify({ dateKey: '2026-10-13' }).status).toBe(DAY_STATUS.ABSENT);
  });
  test('pending leave does not protect the day (existing policy) but is noted', () => {
    expect(classify({ dateKey: '2026-10-13', leaves: [leave('2026-10-13', '2026-10-13', 'CASUAL', 'PENDING')] })).toMatchObject({ status: DAY_STATUS.ABSENT, pendingLeave: true });
  });
  test.each(['REJECTED', 'CANCELLED'])('%s leave does not suppress absence', (status) => {
    expect(classify({ dateKey: '2026-10-13', leaves: [leave('2026-10-13', '2026-10-13', 'CASUAL', status)] }).status).toBe(DAY_STATUS.ABSENT);
  });
  test('holiday, weekly off (Sunday), future, today and before joining are never Absent', () => {
    expect(classify({ dateKey: '2026-10-13', holiday: 'Diwali' }).status).toBe(DAY_STATUS.HOLIDAY);
    expect(classify({ dateKey: '2026-10-11', weekday: 0 }).status).toBe(DAY_STATUS.WEEKLY_OFF);
    expect(classify({ dateKey: '2026-10-21' }).status).toBe(DAY_STATUS.UPCOMING);
    expect(classify({ dateKey: '2026-10-20' }).status).toBe(DAY_STATUS.TODAY);
    expect(classify({ dateKey: '2026-10-13', joiningKey: '2026-10-15' }).status).toBe(DAY_STATUS.NOT_EMPLOYED);
  });
  test('Saturdays are working days (they can be Absent)', () => {
    expect(classify({ dateKey: '2026-10-17', weekday: 6 }).status).toBe(DAY_STATUS.ABSENT);
  });
  test('a whole month: counts add up and nothing is invented', () => {
    const c = cal({ records: [rec('2026-10-05', 'PRESENT'), rec('2026-10-06', 'LATE')], leaves: [leave('2026-10-07', '2026-10-07', 'SICK')], holidays: [{ date: day('2026-10-02'), name: 'Gandhi Jayanti' }] });
    expect(c.summary).toMatchObject({ PRESENT: 1, LATE: 1, SICK_LEAVE: 1, HOLIDAY: 1, WEEKLY_OFF: 4, TODAY: 1 });
    expect(c.summary.UPCOMING).toBe(10); // 21–31 Oct (11 days) minus Sunday 25
    expect(Object.values(c.summary).reduce((a, b) => a + b, 0)).toBe(31);
  });
});

describe('overtime clock (finalized overtime only, same rule as the Salary Report)', () => {
  test('India: after 7 PM counts from 6 PM; at or before 7 PM, none', () => {
    const c = cal({ records: [rec('2026-10-05', 'PRESENT', '09:30:00', '20:15:00'), rec('2026-10-06', 'PRESENT', '09:30:00', '19:00:00')] });
    expect(cellOf(c, '2026-10-05')).toMatchObject({ overtimeMinutes: 135, hasOvertime: true });
    expect(cellOf(c, '2026-10-06')).toMatchObject({ overtimeMinutes: 0, hasOvertime: false });
  });
  test('no check-out → no overtime and no icon (never a live estimate)', () => {
    const c = cal({ records: [rec('2026-10-20', 'PRESENT', '09:30:00', null)] });
    expect(cellOf(c, '2026-10-20')).toMatchObject({ checkOut: null, overtimeMinutes: null, hasOvertime: false });
  });
  test("Rifan's Dubai rule (7 PM Dubai = 20:30 IST, counted from 19:30 IST)", () => {
    const rifan = { _id: 'r', firstName: 'MUHAMMED', lastName: 'RIFAN', joiningDate: day('2026-08-28'), overtimeCutoffTime: '20:30', workingEndTime: '19:30' };
    const c = buildAttendanceCalendar({ range: monthRange('2026-10'), employee: rifan, officeSettings: office, today: TODAY, timeZone: TZ, records: [rec('2026-10-05', 'PRESENT', '11:30:00', '20:30:00'), rec('2026-10-06', 'PRESENT', '11:30:00', '21:30:00')] });
    expect(cellOf(c, '2026-10-05').hasOvertime).toBe(false); // exactly 7:00 PM Dubai
    expect(cellOf(c, '2026-10-06')).toMatchObject({ overtimeMinutes: 120, hasOvertime: true }); // 8:00 PM Dubai
  });
});

describe('GET /api/reports/attendance-calendar', () => {
  const app = createApp();
  const PASSWORD = 'Test@12345';
  async function setup(email, role, extra = {}) {
    const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
    const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 7)}`, firstName: email.split('@')[0], lastName: 'T', joiningDate: day('2026-01-01'), ...extra });
    user.employeeId = employee._id;
    await user.save();
    const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
    return { user, employee, token };
  }
  const get = (token, q) => request(app).get(`/api/reports/attendance-calendar${q}`).set('Authorization', `Bearer ${token}`);

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await OfficeSettings.create({ officeName: 'ZORX', latitude: 10, longitude: 76, attendanceRadius: 200, workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: TZ, lateThresholdMinutes: 5, halfDayThresholdMinutes: 240, overtimeEnabled: true });
  });

  test('HR/Admin gets one employee’s month; employees are refused; bad input is rejected', async () => {
    const hr = await setup('hr@zorx.test', ROLES.ADMIN);
    const asha = await setup('asha@zorx.test', ROLES.EMPLOYEE);
    const other = await setup('other@zorx.test', ROLES.EMPLOYEE);
    await Attendance.create([
      { employeeId: asha.employee._id, date: day('2026-10-05'), status: 'LATE', checkIn: { timestamp: ist('2026-10-05', '09:50:00') }, checkOut: { timestamp: ist('2026-10-05', '20:00:00') } },
      { employeeId: asha.employee._id, date: day('2026-11-02'), status: 'PRESENT', checkIn: { timestamp: ist('2026-11-02', '09:30:00') } },
      { employeeId: other.employee._id, date: day('2026-10-06'), status: 'PRESENT', checkIn: { timestamp: ist('2026-10-06', '09:30:00') } },
    ]);
    await Leave.create({ employeeId: asha.employee._id, leaveType: 'CASUAL', startDate: day('2026-10-07'), endDate: day('2026-10-07'), days: 1, duration: 'FULL_DAY', reason: 'family', status: 'APPROVED' });
    await Holiday.create({ date: day('2026-10-02'), name: 'Gandhi Jayanti', createdBy: hr.user._id });
    const before = await Attendance.countDocuments();

    const res = await get(hr.token, `?employeeId=${asha.employee._id}&month=2026-10`);
    expect(res.status).toBe(200);
    const cells = res.body.data.weeks.flat().filter(Boolean);
    const at = (k) => cells.find((c) => c.dateKey === k);
    expect(at('2026-10-05')).toMatchObject({ status: 'LATE', checkIn: '09:50 AM', checkOut: '08:00 PM', hasOvertime: true, overtimeMinutes: 120 });
    expect(at('2026-10-06').status).toBe('ABSENT'); // the other employee's record never leaks in
    expect(at('2026-10-07').status).toBe('CASUAL_LEAVE');
    expect(at('2026-10-02').status).toBe('HOLIDAY');
    expect(cells.find((c) => c.dateKey === '2026-11-02')).toBeUndefined(); // other month
    expect(await Attendance.countDocuments()).toBe(before); // nothing written for Absent days

    expect((await get(asha.token, `?employeeId=${asha.employee._id}&month=2026-10`)).status).toBe(403);
    expect((await get(hr.token, '?month=2026-10')).status).toBe(400);
    expect((await get(hr.token, `?employeeId=${asha.employee._id}&month=2026-13`)).status).toBe(400);
    expect((await get(hr.token, '?employeeId=64b000000000000000000000&month=2026-10')).status).toBe(404);
  });
});
