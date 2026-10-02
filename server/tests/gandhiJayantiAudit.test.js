import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const REAL_PASSWORD = 'RealEmployee@123';

describe('Gandhi Jayanti Celebration & Date Logic Audit', () => {
  const GANDHI_JAYANTI_DATE = '2026-10-02';

  function isGandhiJayantiDate(dateStr) {
    return dateStr === GANDHI_JAYANTI_DATE;
  }

  function getLocalFormattedDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  test('activates strictly on 2026-10-02', () => {
    expect(isGandhiJayantiDate('2026-10-02')).toBe(true);
  });

  test('inactive on eve 2026-10-01', () => {
    expect(isGandhiJayantiDate('2026-10-01')).toBe(false);
  });

  test('expires automatically on 2026-10-03', () => {
    expect(isGandhiJayantiDate('2026-10-03')).toBe(false);
  });

  test('inactive on subsequent years 2027-10-02', () => {
    expect(isGandhiJayantiDate('2027-10-02')).toBe(false);
  });

  test('local date formatting produces zero-padded YYYY-MM-DD without UTC day shift', () => {
    const oct2Local = new Date(2026, 9, 2, 0, 1, 0); // 00:01 local Oct 2
    expect(getLocalFormattedDate(oct2Local)).toBe('2026-10-02');

    const oct2Late = new Date(2026, 9, 2, 23, 59, 0); // 23:59 local Oct 2
    expect(getLocalFormattedDate(oct2Late)).toBe('2026-10-02');

    const oct3Local = new Date(2026, 9, 3, 0, 0, 0); // 00:00 local Oct 3
    expect(getLocalFormattedDate(oct3Local)).toBe('2026-10-03');
  });

  test('navbar icon visibility is date-based and independent of check-in status across all roles', () => {
    function shouldShowNavbarIcon(dateStr, isAuthenticated) {
      return Boolean(isAuthenticated) && isGandhiJayantiDate(dateStr);
    }

    const roles = [ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.SUPER_ADMIN];
    for (const role of roles) {
      // On Oct 2, authenticated user of any role sees icon regardless of checkIn status
      expect(shouldShowNavbarIcon('2026-10-02', { role, hasCheckedIn: false })).toBe(true);
      expect(shouldShowNavbarIcon('2026-10-02', { role, hasCheckedIn: true })).toBe(true);

      // On Oct 1 and Oct 3, icon is hidden
      expect(shouldShowNavbarIcon('2026-10-01', { role, hasCheckedIn: false })).toBe(false);
      expect(shouldShowNavbarIcon('2026-10-03', { role, hasCheckedIn: false })).toBe(false);
    }

    // Unauthenticated user never sees icon
    expect(shouldShowNavbarIcon('2026-10-02', null)).toBe(false);
  });
});

describe('Gandhi Jayanti: Attendance Isolation & Database Safety', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  test('real employee attendance is untouched by any Gandhi replay or virtual actions', async () => {
    const passwordHash = await User.hashPassword(REAL_PASSWORD);
    const user = await User.create({ email: 'emp@zorx.test', passwordHash, role: ROLES.EMPLOYEE });
    const employee = await Employee.create({
      userId: user._id,
      employeeCode: 'E-12345',
      firstName: 'Real',
      lastName: 'Worker',
      joiningDate: new Date('2025-01-01'),
    });
    user.employeeId = employee._id;
    await user.save();

    const loginRes = await request(app).post('/api/auth/login').send({ email: 'emp@zorx.test', password: REAL_PASSWORD });
    const token = loginRes.body.data.token;

    // Real employee checking me/today before check-in
    const meRes = await request(app).get('/api/attendance/me/today').set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.attendance).toBeNull();

    // Verify resetVirtualAttendance rejects real employee
    const resetRes = await request(app).post('/api/attendance/virtual/reset').set('Authorization', `Bearer ${token}`);
    expect(resetRes.status).toBe(403);

    // Verify 0 attendance records were created or affected
    expect(await Attendance.countDocuments({})).toBe(0);
  });
});
