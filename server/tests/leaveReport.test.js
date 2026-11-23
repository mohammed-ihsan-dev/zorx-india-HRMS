import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Leave } from '../src/models/Leave.js';
import { ROLES, LEAVE_TYPE, LEAVE_STATUS, LEAVE_DURATION } from '../src/utils/constants.js';
import { creditsThrough, yearlyAllowance, leaveYearDates } from '../src/services/leaveService.js';
import { resolveLeavePeriod, daysInPeriod, summarizeTaken, csvCell, parseDayKey } from '../src/services/leaveReportService.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const key = (ymd) => new Date(`${ymd}T00:00:00.000Z`);

async function createUser(role, email, joiningDate = new Date('2025-01-01'), firstName = role) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${email.split('@')[0]}`, firstName, lastName: 'Test', joiningDate });
  user.employeeId = employee._id;
  await user.save();
  return { user, employee };
}
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
const leave = (employeeId, leaveType, start, end, days, status = LEAVE_STATUS.APPROVED, extra = {}) =>
  Leave.create({ employeeId, leaveType, startDate: key(start), endDate: key(end), days, reason: extra.reason || `${leaveType} ${start}`, status, ...extra });
const half = (session = 'MORNING') => ({ duration: LEAVE_DURATION.HALF_DAY, halfDaySession: session });

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearTestDb);

describe('reporting periods (HRMS timezone)', () => {
  test('current month is the first to last calendar day of the India month', () => {
    const r = resolveLeavePeriod({ period: 'current_month' }, new Date('2026-11-23T10:00:00Z'), 'Asia/Kolkata');
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(r.label).toBe('November 2026');
  });

  test('month boundary follows India time, not UTC (30 Nov 19:00 UTC is 1 Dec in India)', () => {
    const r = resolveLeavePeriod({ period: 'current_month' }, new Date('2026-11-30T19:00:00Z'), 'Asia/Kolkata');
    expect(r.label).toBe('December 2026');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  test('previous month handles the year change (January → December of the year before)', () => {
    const r = resolveLeavePeriod({ period: 'previous_month' }, new Date('2027-01-10T06:00:00Z'), 'Asia/Kolkata');
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  test('previous month of March in a non-leap year ends on 28 Feb', () => {
    const r = resolveLeavePeriod({ period: 'previous_month' }, new Date('2027-03-05T06:00:00Z'), 'Asia/Kolkata');
    expect(r.to.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  test('custom range, all time and invalid input', () => {
    const c = resolveLeavePeriod({ period: 'custom', from: '2026-10-15', to: '2026-11-15' });
    expect(c.from.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(resolveLeavePeriod({ period: 'all' })).toMatchObject({ from: null, to: null, label: 'All time' });
    expect(() => resolveLeavePeriod({ period: 'custom', from: '2026-11-15', to: '2026-11-01' })).toThrow(/end date/);
    expect(() => resolveLeavePeriod({ period: 'custom', from: '2026-02-31', to: '2026-03-01' })).toThrow(/valid start/);
    expect(() => resolveLeavePeriod({ period: 'yearly' })).toThrow(/reporting period/);
  });
});

describe('days in a period', () => {
  const nov = { from: key('2026-11-01'), to: key('2026-11-30') };
  const dec = { from: key('2026-12-01'), to: key('2026-12-31') };
  const jan = { from: key('2027-01-01'), to: key('2027-01-31') };

  test('full day = 1, half day = 0.5, outside = 0, all time = stored days', () => {
    expect(daysInPeriod({ startDate: key('2026-11-05'), endDate: key('2026-11-05'), days: 1 }, nov.from, nov.to)).toBe(1);
    expect(daysInPeriod({ startDate: key('2026-11-05'), endDate: key('2026-11-05'), days: 0.5, ...half() }, nov.from, nov.to)).toBe(0.5);
    expect(daysInPeriod({ startDate: key('2026-10-05'), endDate: key('2026-10-06'), days: 2 }, nov.from, nov.to)).toBe(0);
    expect(daysInPeriod({ startDate: key('2026-10-05'), endDate: key('2026-10-06'), days: 2 })).toBe(2);
  });

  test('a leave spanning two months is split between them', () => {
    const l = { startDate: key('2026-11-28'), endDate: key('2026-12-03'), days: 6 };
    expect(daysInPeriod(l, nov.from, nov.to)).toBe(3);
    expect(daysInPeriod(l, dec.from, dec.to)).toBe(3);
  });

  test('a leave spanning two years is split between them', () => {
    const l = { startDate: key('2026-12-30'), endDate: key('2027-01-02'), days: 4 };
    expect(daysInPeriod(l, dec.from, dec.to)).toBe(2);
    expect(daysInPeriod(l, jan.from, jan.to)).toBe(2);
  });

  test('taken totals: approved only, each record once, two half days = 1, LoP family together', () => {
    const rows = [
      { leaveType: 'SICK', status: 'APPROVED', startDate: key('2026-11-03'), endDate: key('2026-11-03'), days: 0.5, ...half('MORNING') },
      { leaveType: 'SICK', status: 'APPROVED', startDate: key('2026-11-04'), endDate: key('2026-11-04'), days: 0.5, ...half('EVENING') },
      { leaveType: 'CASUAL', status: 'APPROVED', startDate: key('2026-11-10'), endDate: key('2026-11-10'), days: 1 },
      { leaveType: 'CASUAL', status: 'PENDING', startDate: key('2026-11-11'), endDate: key('2026-11-11'), days: 1 },
      { leaveType: 'CASUAL', status: 'REJECTED', startDate: key('2026-11-12'), endDate: key('2026-11-12'), days: 1 },
      { leaveType: 'CASUAL', status: 'CANCELLED', startDate: key('2026-11-13'), endDate: key('2026-11-13'), days: 1 },
      { leaveType: 'LOP', status: 'APPROVED', startDate: key('2026-11-14'), endDate: key('2026-11-14'), days: 1 },
      { leaveType: 'PAID', status: 'APPROVED', startDate: key('2026-11-15'), endDate: key('2026-11-15'), days: 1 },
      { leaveType: 'UNPAID', status: 'APPROVED', startDate: key('2026-11-16'), endDate: key('2026-11-16'), days: 0.5, ...half() },
    ];
    expect(summarizeTaken(rows, nov.from, nov.to)).toEqual({ casual: 1, sick: 1, lop: 2.5, other: 0, total: 4.5, approvedRequests: 6 });
  });

  test('CSV cells: formulas neutralised, numbers kept numeric, quotes escaped', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+91 98765')).toBe("'+91 98765");
    expect(csvCell(0.5)).toBe('0.5');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(parseDayKey('2026-11-31')).toBeNull();
  });
});

describe('GET /api/reports/leave and /api/reports/leave/stats', () => {
  async function seed() {
    const { user: admin } = await createUser(ROLES.ADMIN, 'hr@zorx.test', new Date('2024-01-01'), 'Hana');
    const { employee: asha } = await createUser(ROLES.EMPLOYEE, 'asha@zorx.test', new Date('2025-01-01'), 'Asha');
    const { employee: ravi } = await createUser(ROLES.EMPLOYEE, 'ravi@zorx.test', new Date('2025-01-01'), 'Ravi');
    // Asha, November 2026
    await leave(asha._id, LEAVE_TYPE.CASUAL, '2026-11-05', '2026-11-05', 1, LEAVE_STATUS.APPROVED, { reviewedBy: admin._id, reviewedAt: new Date() });
    await leave(asha._id, LEAVE_TYPE.CASUAL, '2026-11-06', '2026-11-06', 0.5, LEAVE_STATUS.APPROVED, half());
    await leave(asha._id, LEAVE_TYPE.SICK, '2026-11-09', '2026-11-09', 0.5, LEAVE_STATUS.APPROVED, half('MORNING'));
    await leave(asha._id, LEAVE_TYPE.SICK, '2026-11-10', '2026-11-10', 0.5, LEAVE_STATUS.APPROVED, half('EVENING'));
    await leave(asha._id, LEAVE_TYPE.SICK, '2026-11-12', '2026-11-12', 1, LEAVE_STATUS.REJECTED);
    await leave(asha._id, LEAVE_TYPE.SICK, '2026-11-13', '2026-11-13', 1, LEAVE_STATUS.CANCELLED);
    await leave(asha._id, LEAVE_TYPE.CASUAL, '2026-11-20', '2026-11-20', 1, LEAVE_STATUS.PENDING);
    await leave(asha._id, LEAVE_TYPE.LOP, '2026-11-28', '2026-12-03', 6, LEAVE_STATUS.APPROVED, { reason: '=HYPERLINK("https://example.invalid","x")' });
    // Asha, October 2026
    await leave(asha._id, LEAVE_TYPE.SICK, '2026-10-20', '2026-10-20', 1);
    // Ravi, November 2026
    await leave(ravi._id, LEAVE_TYPE.CASUAL, '2026-11-17', '2026-11-18', 2);
    await leave(ravi._id, LEAVE_TYPE.PAID, '2026-11-19', '2026-11-19', 1);
    return { token: await login('hr@zorx.test'), admin, asha, ravi };
  }
  const NOV = { period: 'custom', from: '2026-11-01', to: '2026-11-30' };

  test("one employee's November: approved only, half days, LoP split across months", async () => {
    const { token, asha } = await seed();
    const res = await request(app).get('/api/reports/leave/stats').query({ ...NOV, employeeId: String(asha._id) }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Casual 1 + 0.5; Sick 0.5 + 0.5 (rejected/cancelled ignored); LoP 3 of the 6 days are in November.
    expect(res.body.data.taken).toMatchObject({ casual: 1.5, sick: 1, lop: 3, other: 0, total: 5.5 });
    expect(res.body.data.employee.name).toBe('Asha Test');
    expect(res.body.data.period).toMatchObject({ key: 'custom', from: '2026-11-01', to: '2026-11-30' });
  });

  test('all employees: aggregated totals, no balance card', async () => {
    const { token } = await seed();
    const res = await request(app).get('/api/reports/leave/stats').query(NOV).set('Authorization', `Bearer ${token}`);
    // Asha 5.5 + Ravi casual 2 + Ravi PAID(=LoP) 1.
    expect(res.body.data.taken).toMatchObject({ casual: 3.5, sick: 1, lop: 4, total: 8.5 });
    expect(res.body.data.sickBalance).toBeNull();
    expect(res.body.data.employee).toBeNull();
  });

  test('all time, December share and leave type filter (LoP includes the old PAID type)', async () => {
    const { token, asha } = await seed();
    const auth = { Authorization: `Bearer ${token}` };
    const all = await request(app).get('/api/reports/leave/stats').query({ period: 'all', employeeId: String(asha._id) }).set(auth);
    expect(all.body.data.taken).toMatchObject({ casual: 1.5, sick: 2, lop: 6, total: 9.5 });
    const dec = await request(app).get('/api/reports/leave/stats').query({ period: 'custom', from: '2026-12-01', to: '2026-12-31', employeeId: String(asha._id) }).set(auth);
    expect(dec.body.data.taken.lop).toBe(3);
    const lop = await request(app).get('/api/reports/leave/stats').query({ ...NOV, leaveType: 'LOP' }).set(auth);
    expect(lop.body.data.taken).toMatchObject({ casual: 0, sick: 0, lop: 4, total: 4 });
  });

  test('Sick Leave remaining: this leave year\'s entitlement minus approved days (today), not the period', async () => {
    const { token, asha } = await seed();
    const res = await request(app).get('/api/reports/leave/stats').query({ ...NOV, employeeId: String(asha._id) }).set('Authorization', `Bearer ${token}`);
    const joined = new Date('2025-01-01');
    const now = new Date();
    const credited = creditsThrough(LEAVE_TYPE.SICK, joined, now, asha._id);
    const allowance = yearlyAllowance(LEAVE_TYPE.SICK, joined, now, asha._id);
    // Approved sick leave seeded: 0.5 + 0.5 (Nov 2026) + 1 (Oct 2026); only days in the current leave year count.
    const year = leaveYearDates(LEAVE_TYPE.SICK, joined, now);
    const inYear = (d) => key(d) >= year.start && key(d) < year.end;
    const approved = [['2026-11-09', 0.5], ['2026-11-10', 0.5], ['2026-10-20', 1]].filter(([d]) => inYear(d)).reduce((a, [, n]) => a + n, 0);
    expect(res.body.data.sickBalance).toMatchObject({ state: 'ok', credited, allowance, approved, pending: 0, remaining: Math.max(0, allowance - approved) });
    expect(res.body.data.sickBalance.resetsOn.slice(0, 10)).toBe(year.end.toISOString().slice(0, 10));
  });

  test('Sick Leave balance shows "not eligible" for a recent joiner instead of a made-up number', async () => {
    const { token } = await seed();
    const { employee: newbie } = await createUser(ROLES.EMPLOYEE, 'new@zorx.test', new Date());
    const res = await request(app).get('/api/reports/leave/stats').query({ employeeId: String(newbie._id) }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sickBalance.state).toBe('not_eligible');
    expect(res.body.data.period.key).toBe('current_month');
  });

  test('history: employee filter, newest first, pagination, half day shown as 0.5, approver name', async () => {
    const { token, asha } = await seed();
    const auth = { Authorization: `Bearer ${token}` };
    const p1 = await request(app).get('/api/reports/leave').query({ ...NOV, employeeId: String(asha._id), page: 1, limit: 5 }).set(auth);
    expect(p1.status).toBe(200);
    expect(p1.body.meta).toMatchObject({ total: 8, page: 1, limit: 5, pages: 2 });
    expect(p1.body.data).toHaveLength(5);
    expect(p1.body.data.every((l) => String(l.employeeId._id) === String(asha._id))).toBe(true);
    const starts = p1.body.data.map((l) => l.startDate);
    expect([...starts].sort().reverse()).toEqual(starts);
    expect(p1.body.data[0]).toMatchObject({ leaveType: 'LOP', days: 6, daysInPeriod: 3 }); // 28 Nov – 3 Dec, newest first
    const p2 = await request(app).get('/api/reports/leave').query({ ...NOV, employeeId: String(asha._id), page: 2, limit: 5 }).set(auth);
    expect(p2.body.data).toHaveLength(3);
    const all = [...p1.body.data, ...p2.body.data];
    expect(all.find((l) => l.duration === 'HALF_DAY' && l.leaveType === 'CASUAL').daysInPeriod).toBe(0.5);
    expect(all.find((l) => l.reviewedBy).approvedByName).toBe('Hana Test');
    // Pending leave is visible in history (but never counted as taken).
    expect(all.some((l) => l.status === 'PENDING')).toBe(true);
  });

  test('history: status filter, all time and an empty period', async () => {
    const { token, asha } = await seed();
    const auth = { Authorization: `Bearer ${token}` };
    const pending = await request(app).get('/api/reports/leave').query({ ...NOV, status: 'PENDING', page: 1 }).set(auth);
    expect(pending.body.meta.total).toBe(1);
    const allTime = await request(app).get('/api/reports/leave').query({ period: 'all', employeeId: String(asha._id), page: 1, limit: 100 }).set(auth);
    expect(allTime.body.meta.total).toBe(9);
    const empty = await request(app).get('/api/reports/leave').query({ period: 'custom', from: '2025-01-01', to: '2025-01-31', page: 1 }).set(auth);
    expect(empty.body).toMatchObject({ data: [], meta: { total: 0, pages: 1 } });
  });

  test('CSV: half day as 0.5, period share, formula-safe reason, summary equals the cards', async () => {
    const { token, asha } = await seed();
    const auth = { Authorization: `Bearer ${token}` };
    const q = { ...NOV, employeeId: String(asha._id) };
    const csv = await request(app).get('/api/reports/leave').query({ ...q, format: 'csv' }).set(auth);
    const stats = await request(app).get('/api/reports/leave/stats').query(q).set(auth);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-disposition']).toMatch(/leave-report-asha-test-2026-11-01-to-2026-11-30\.csv/);
    const text = csv.text.replace(/^﻿/, '');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Employee Code,Employee Name,Leave Type,Duration,Start Date,End Date,Number of Days,Days In Period,Reason,Status,Approved By,Applied On,Reviewed Date');
    expect(lines.some((l) => l.includes('Half Day (Morning),2026-11-06,2026-11-06,0.5,0.5,'))).toBe(true);
    expect(text).toContain(`"'=HYPERLINK(`);
    expect(text).not.toMatch(/,=HYPERLINK/);
    const { taken } = stats.body.data;
    expect(text).toContain(`Casual Leave Taken (approved days),${taken.casual}`);
    expect(text).toContain(`Sick Leave Taken (approved days),${taken.sick}`);
    expect(text).toContain(`LoP Taken (approved days),${taken.lop}`);
    expect(text).toContain(`Total Leave Taken (approved days),${taken.total}`);
  });

  test('invalid filters are a 400, never a 500', async () => {
    const { token } = await seed();
    const auth = { Authorization: `Bearer ${token}` };
    for (const q of [{ period: 'yearly' }, { period: 'custom', from: '2026-11-10' }, { employeeId: 'abc' }, { leaveType: 'HOLIDAY' }]) {
      expect((await request(app).get('/api/reports/leave/stats').query(q).set(auth)).status).toBe(400);
    }
    expect((await request(app).get('/api/reports/leave').query({ status: 'DONE' }).set(auth)).status).toBe(400);
    expect((await request(app).get('/api/reports/leave').query({ from: 'not-a-date' }).set(auth)).status).toBe(400);
    const missing = await request(app).get('/api/reports/leave/stats').query({ employeeId: '64b000000000000000000000' }).set(auth);
    expect(missing.status).toBe(404);
  });

  test('employees cannot read leave reports or statistics', async () => {
    await seed();
    await createUser(ROLES.EMPLOYEE, 'peek@zorx.test');
    const token = await login('peek@zorx.test');
    expect((await request(app).get('/api/reports/leave/stats').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get('/api/reports/leave').query({ page: 1 }).set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  test('current month is the default period', async () => {
    const { token } = await seed();
    const res = await request(app).get('/api/reports/leave/stats').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.period.label).toBe(resolveLeavePeriod({ period: 'current_month' }).label);
  });
});
