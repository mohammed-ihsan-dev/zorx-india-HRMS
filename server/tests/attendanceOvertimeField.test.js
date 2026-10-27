import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { ROLES } from '../src/utils/constants.js';

// GET /attendance/me adds a display-only overtimeAfter7Minutes per record
// (same rule as the Salary Report); nothing is written to the records.
const app = createApp();
const PASSWORD = 'Test@12345';
const ist = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+05:30`);

async function employee() {
  const user = await User.create({ email: 'e@zorx.test', passwordHash: await User.hashPassword(PASSWORD), role: ROLES.EMPLOYEE });
  const emp = await Employee.create({ userId: user._id, employeeCode: 'E-1', firstName: 'Asha', lastName: 'K', joiningDate: new Date('2024-01-15') });
  user.employeeId = emp._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD })).body.data.token;
  return { emp, token };
}

beforeAll(async () => {
  await startTestDb();
});
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
});

test('overtime after 7:00 PM per day, from the recorded check-out only; records unchanged', async () => {
  const { emp, token } = await employee();
  const cases = [
    ['2026-10-20', '18:00', 0],
    ['2026-10-21', '19:00', 0],
    ['2026-10-22', '19:01', 1],
    ['2026-10-26', '20:15', 75],
    ['2026-10-27', null, null],
  ];
  for (const [ymd, out] of cases) {
    await Attendance.create({ employeeId: emp._id, date: new Date(`${ymd}T00:00:00.000Z`), checkIn: { timestamp: ist(ymd, '10:00') }, checkOut: out ? { timestamp: ist(ymd, out) } : null, status: 'PRESENT' });
  }
  const before = await Attendance.find({}).sort({ _id: 1 }).lean();
  const res = await request(app).get('/api/attendance/me').set('Authorization', `Bearer ${token}`).query({ from: '2026-10-01', to: '2026-10-31', limit: 31 });
  expect(res.status).toBe(200);
  const byDay = Object.fromEntries(res.body.data.map((r) => [r.date.slice(0, 10), r.overtimeAfter7Minutes]));
  expect(byDay).toEqual(Object.fromEntries(cases.map(([d, , m]) => [d, m])));
  // Existing fields are still returned as before.
  expect(res.body.data[0]).toMatchObject({ status: 'PRESENT', employeeId: emp._id.toString() });
  expect(res.body.meta).toMatchObject({ total: 5, page: 1, limit: 31 });
  expect(await Attendance.find({}).sort({ _id: 1 }).lean()).toEqual(before);
  expect(before.every((r) => !('overtimeAfter7Minutes' in r))).toBe(true);
});
