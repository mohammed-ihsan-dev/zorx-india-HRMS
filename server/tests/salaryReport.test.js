import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { ROLES } from '../src/utils/constants.js';
import { overtimeAfterCutoffMinutes, formatOvertime, formatClockTime, monthRange } from '../src/services/salaryReportService.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const TZ = 'Asia/Kolkata';
const ist = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+05:30`);
const dayKey = (ymd) => new Date(`${ymd}T00:00:00.000Z`);

async function setup(role, email, firstName = email.split('@')[0], lastName = 'Test') {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName, lastName, joiningDate: new Date('2024-01-15') });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const punch = (employeeId, ymd, inAt, outAt, extra = {}) =>
  Attendance.create({
    employeeId,
    date: dayKey(ymd),
    checkIn: inAt ? { timestamp: ist(ymd, inAt) } : null,
    checkOut: outAt ? { timestamp: typeof outAt === 'string' ? ist(ymd, outAt) : outAt } : null,
    status: 'PRESENT',
    ...extra,
  });
const report = (token, query) => request(app).get('/api/reports/salary').set(auth(token)).query(query);
const binary = (req) =>
  req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

beforeAll(async () => {
  await startTestDb();
});
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
});

describe('overtime after 7:00 PM', () => {
  const ot = (out) => overtimeAfterCutoffMinutes(dayKey('2026-10-20'), out, { timeZone: TZ });
  test.each([
    ['06:00 PM checkout', ist('2026-10-20', '18:00'), 0],
    ['exactly 7:00 PM', ist('2026-10-20', '19:00'), 0],
    ['7:00:59 PM (under a minute)', new Date('2026-10-20T19:00:59+05:30'), 0],
    ['7:30 PM', ist('2026-10-20', '19:30'), 30],
    ['8:15 PM', ist('2026-10-20', '20:15'), 75],
    ['12:30 AM the next day', ist('2026-10-21', '00:30'), 330],
  ])('%s', (_, out, minutes) => {
    expect(ot(out)).toBe(minutes);
  });

  test('missing, invalid or impossible checkouts are never guessed', () => {
    expect(ot(null)).toBeNull();
    expect(ot('not-a-date')).toBeNull();
    expect(ot(ist('2026-10-19', '20:00'))).toBeNull(); // before the attendance day
    expect(overtimeAfterCutoffMinutes(null, ist('2026-10-20', '20:00'))).toBeNull();
  });

  test('uses the office timezone, not UTC: 7:30 PM IST is 14:00 UTC', () => {
    expect(ot(new Date('2026-10-20T14:00:00Z'))).toBe(30);
    expect(ot(new Date('2026-10-20T13:29:00Z'))).toBe(0); // 6:59 PM IST
  });

  test('formatting', () => {
    expect([0, 30, 75, 120].map(formatOvertime)).toEqual(['00h 00m', '00h 30m', '01h 15m', '02h 00m']);
    expect(formatOvertime(null)).toBe('—');
    expect(formatClockTime(ist('2026-10-20', '19:30'), TZ)).toBe('07:30 PM');
    expect(formatClockTime(ist('2026-10-20', '00:05'), TZ)).toBe('12:05 AM');
    expect(formatClockTime(null, TZ)).toBe('—');
    expect(monthRange('2026-13')).toBeNull();
    expect(monthRange('2026-12').end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('access', () => {
  test('Super Admin and HR (Admin) can open it; employees and anonymous users cannot', async () => {
    const sa = await setup(ROLES.SUPER_ADMIN, 'owner@zorx.test');
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    expect((await report(sa.token, { month: '2026-10' })).status).toBe(200);
    expect((await report(hr.token, { month: '2026-10' })).status).toBe(200);
    expect((await report(emp.token, { month: '2026-10' })).status).toBe(403);
    expect((await report(emp.token, { month: '2026-10', format: 'csv' })).status).toBe(403);
    expect((await report(emp.token, { month: '2026-10', format: 'pdf', employeeId: emp.employee._id.toString() })).status).toBe(403);
    expect((await request(app).get('/api/reports/salary').query({ month: '2026-10' })).status).toBe(401);
  });

  test('validates month, employee and format', async () => {
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test');
    expect((await report(hr.token, { month: 'oct' })).status).toBe(400);
    expect((await report(hr.token, { month: '2026-13' })).status).toBe(400);
    expect((await report(hr.token, { month: '2026-10', employeeId: 'abc' })).status).toBe(400);
    expect((await report(hr.token, { month: '2026-10', employeeId: '64b000000000000000000000' })).status).toBe(404);
    expect((await report(hr.token, { month: '2026-10', format: 'xlsx' })).status).toBe(400);
  });
});

describe('filters and rows', () => {
  async function data() {
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test', 'Hari', 'R');
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test', 'Asha', 'K');
    const b = await setup(ROLES.EMPLOYEE, 'bala@zorx.test', 'Bala', 'M');
    await punch(a.employee._id, '2026-10-20', '10:00', '19:30');
    await punch(b.employee._id, '2026-10-20', '09:30', '18:00');
    await punch(a.employee._id, '2026-10-01', '09:30', '20:15'); // first day of month
    await punch(a.employee._id, '2026-10-31', '10:00', null); // last day, no checkout
    await punch(a.employee._id, '2026-09-30', '10:00', '21:00'); // previous month
    await punch(a.employee._id, '2026-11-01', '10:00', '21:00'); // next month
    await punch(b.employee._id, '2026-10-21', null, null, { status: 'LEAVE' }); // no punch: not a row
    return { hr, a, b };
  }

  test('all employees: only that month, date then name order, names on every row', async () => {
    const { hr } = await data();
    const res = await report(hr.token, { month: '2026-10' });
    expect(res.body.meta).toMatchObject({ monthLabel: 'October 2026', employee: 'All Employees', total: 4 });
    expect(res.body.data.map((r) => [r.date, r.employeeName, r.checkIn, r.checkOut, r.overtime])).toEqual([
      ['01 Oct 2026', 'Asha K', '09:30 AM', '08:15 PM', '01h 15m'],
      ['20 Oct 2026', 'Asha K', '10:00 AM', '07:30 PM', '00h 30m'],
      ['20 Oct 2026', 'Bala M', '09:30 AM', '06:00 PM', '00h 00m'],
      ['31 Oct 2026', 'Asha K', '10:00 AM', '—', '—'],
    ]);
  });

  test('one employee, and month/year boundaries', async () => {
    const { hr, a, b } = await data();
    const one = await report(hr.token, { month: '2026-10', employeeId: b.employee._id.toString() });
    expect(one.body.meta.employee).toBe('Bala M');
    expect(one.body.data.map((r) => r.date)).toEqual(['20 Oct 2026']);
    expect((await report(hr.token, { month: '2026-09', employeeId: a.employee._id.toString() })).body.data.map((r) => r.date)).toEqual(['30 Sep 2026']);
    await punch(a.employee._id, '2026-12-31', '10:00', '19:10');
    await punch(a.employee._id, '2027-01-01', '10:00', '19:20');
    expect((await report(hr.token, { month: '2026-12' })).body.data.map((r) => r.overtime)).toEqual(['00h 10m']);
    expect((await report(hr.token, { month: '2027-01' })).body.data.map((r) => r.overtime)).toEqual(['00h 20m']);
  });

  test('an empty month returns no rows; empty exports are refused clearly', async () => {
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const res = await report(hr.token, { month: '2026-10' });
    expect(res.body.data).toEqual([]);
    const csv = await report(hr.token, { month: '2026-10', format: 'csv' });
    expect(csv.status).toBe(404);
    expect(csv.body.message).toMatch(/No attendance records for All Employees in October 2026/);
    expect((await report(hr.token, { month: '2026-10', format: 'pdf' })).status).toBe(404);
  });

  test('the report never changes attendance', async () => {
    const { hr } = await data();
    const before = await Attendance.find({}).sort({ _id: 1 }).lean();
    await report(hr.token, { month: '2026-10' });
    await report(hr.token, { month: '2026-10', format: 'csv' });
    await binary(report(hr.token, { month: '2026-10', format: 'pdf' }));
    expect(await Attendance.find({}).sort({ _id: 1 }).lean()).toEqual(before);
  });
});

describe('exports', () => {
  test('CSV: exactly the five columns, every row, escaped, same values as the table', async () => {
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test', 'Asha, "AK"', 'K');
    await punch(a.employee._id, '2026-10-20', '10:00', '19:30');
    await punch(a.employee._id, '2026-10-21', '10:00', null);
    const table = (await report(hr.token, { month: '2026-10' })).body.data;
    const res = await report(hr.token, { month: '2026-10', format: 'csv', employeeId: a.employee._id.toString() });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="salary-report-asha-ak-k-2026-10.csv"');
    const lines = res.text.replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe('Employee Name,Date,Check-in Time,Check-out Time,Overtime Used');
    expect(lines.slice(1)).toEqual(table.map((r) => `"Asha, ""AK"" K",${r.date},${r.checkIn},${r.checkOut},${r.overtime}`));
    expect(res.text).not.toMatch(/[0-9a-f]{24}/); // no internal ids
  });

  test('the export filename header is readable by the web app across origins', async () => {
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    await punch(a.employee._id, '2026-10-20', '10:00', '19:30');
    const res = await report(hr.token, { month: '2026-10', format: 'csv' }).set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-expose-headers']).toBe('Content-Disposition');
  });

  test('PDF: branded, filters shown, every row present, header repeated across pages', async () => {
    const hr = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emps = [];
    for (let i = 0; i < 4; i += 1) emps.push(await setup(ROLES.EMPLOYEE, `e${i}@zorx.test`, `Person${i}`, 'Z'));
    // 4 employees × 31 days = 124 rows → several pages.
    for (const e of emps) for (let d = 1; d <= 31; d += 1) await punch(e.employee._id, `2026-10-${String(d).padStart(2, '0')}`, '10:00', d % 2 ? '19:45' : '18:00');
    const res = await binary(report(hr.token, { month: '2026-10', format: 'pdf' }));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="salary-report-2026-10.pdf"');
    const pdf = res.body.toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    const pages = Number(/\/Count (\d+)/.exec(pdf)[1]);
    expect(pages).toBeGreaterThan(2);
    for (const s of ['(ZORX INDIA)', '(Salary Report)', '(Month: October 2026)', '(Employee: All Employees)', `(Page ${pages} of ${pages})`]) expect(pdf).toContain(s);
    expect(pdf.split('(Employee Name)').length - 1).toBe(pages); // header on every page
    expect(pdf.split('(00h 45m)').length - 1).toBe(4 * 16); // odd days, matches the table
    expect(pdf.split('(00h 00m)').length - 1).toBe(4 * 15);
    for (let i = 0; i < 4; i += 1) expect(pdf.split(`(Person${i} Z)`).length - 1).toBe(31);
  });
});
