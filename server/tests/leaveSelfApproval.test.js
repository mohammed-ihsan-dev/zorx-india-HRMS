import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { Leave } from '../src/models/Leave.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { ROLES, LEAVE_STATUS } from '../src/utils/constants.js';

// HR (ADMIN) must never review their own leave; HR/Admin leave is reviewed by a
// Super Admin only. Enforced on the server, not just by hiding buttons.
const app = createApp();
const PASSWORD = 'Test@12345';

async function account(email, role) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const emp = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: email.split('@')[0], lastName: 'T', joiningDate: new Date('2024-01-01') });
  user.employeeId = emp._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee: emp, token };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const submit = (t) => request(app).post('/api/leaves').set(auth(t)).send({ leaveType: 'LOP', startDate: '2027-03-10', endDate: '2027-03-10', reason: 'Family function' });
const review = (t, id, verb) => request(app).patch(`/api/leaves/${id}/${verb}`).set(auth(t)).send({ reviewNote: '' });

let hr, hr2, superAdmin, employee;
beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  await OfficeSettings.create({ officeName: 'ZORX INDIA', latitude: 10.99, longitude: 76.44, attendanceRadius: 200, workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60, timezone: 'Asia/Kolkata' });
  hr = await account('hr@zorx.test', ROLES.ADMIN);
  hr2 = await account('hr2@zorx.test', ROLES.ADMIN);
  superAdmin = await account('boss@zorx.test', ROLES.SUPER_ADMIN);
  employee = await account('staff@zorx.test', ROLES.EMPLOYEE);
});

test('HR can request their own leave (stays pending)', async () => {
  const res = await submit(hr.token);
  expect(res.status).toBe(201);
  expect(res.body.data.status).toBe(LEAVE_STATUS.PENDING);
});

test.each(['approve', 'reject'])('HR cannot %s their own leave — even by calling the API directly', async (verb) => {
  const id = (await submit(hr.token)).body.data._id;
  const res = await review(hr.token, id, verb);
  expect(res.status).toBe(403);
  expect((await Leave.findById(id)).status).toBe(LEAVE_STATUS.PENDING);
});

test.each(['approve', 'reject'])('another HR cannot %s an HR leave request (Super Admin only)', async (verb) => {
  const id = (await submit(hr.token)).body.data._id;
  expect((await review(hr2.token, id, verb)).status).toBe(403);
  expect((await Leave.findById(id)).status).toBe(LEAVE_STATUS.PENDING);
});

test('a Super Admin approves an HR leave request; HR sees the result', async () => {
  const id = (await submit(hr.token)).body.data._id;
  const res = await review(superAdmin.token, id, 'approve');
  expect(res.status).toBe(200);
  const mine = await request(app).get('/api/leaves/me').set(auth(hr.token));
  expect(mine.body.data.leaves.find((l) => l._id === id).status).toBe(LEAVE_STATUS.APPROVED);
});

test('a Super Admin rejects an HR leave request', async () => {
  const id = (await submit(hr.token)).body.data._id;
  expect((await review(superAdmin.token, id, 'reject')).status).toBe(200);
  expect((await Leave.findById(id)).status).toBe(LEAVE_STATUS.REJECTED);
});

test('a Super Admin cannot approve their own leave either', async () => {
  const id = (await submit(superAdmin.token)).body.data._id;
  expect((await review(superAdmin.token, id, 'approve')).status).toBe(403);
});

test('unchanged: HR still approves and rejects ordinary employee leave', async () => {
  const a = (await submit(employee.token)).body.data._id;
  expect((await review(hr.token, a, 'approve')).status).toBe(200);
  await Leave.deleteMany({});
  const b = (await submit(employee.token)).body.data._id;
  expect((await review(hr.token, b, 'reject')).status).toBe(200);
});

test('unchanged: an employee cannot review any leave', async () => {
  const id = (await submit(hr.token)).body.data._id;
  expect((await review(employee.token, id, 'approve')).status).toBe(403);
});

test('an app version from before the LoP rename can still request it (PAID is stored as LOP)', async () => {
  const res = await request(app).post('/api/leaves').set(auth(employee.token)).send({ leaveType: 'PAID', startDate: '2027-03-12', endDate: '2027-03-12', reason: 'Family function' });
  expect(res.status).toBe(201);
  expect(res.body.data.leaveType).toBe('LOP');
});

test('LoP notifications read naturally', async () => {
  const id = (await submit(employee.token)).body.data._id;
  await review(hr.token, id, 'approve');
  const { Notification } = await import('../src/models/Notification.js');
  const msgs = (await Notification.find({}).lean()).map((n) => n.message);
  expect(msgs.some((m) => m.endsWith('submitted a LoP request.'))).toBe(true);
  expect(msgs).toContain('Your LoP request has been approved.');
});

test('the leave list tells reviewers who is HR (requesterRole)', async () => {
  await submit(hr.token);
  await submit(employee.token);
  const res = await request(app).get('/api/leaves?status=PENDING').set(auth(superAdmin.token));
  const roles = res.body.data.map((l) => l.requesterRole).sort();
  expect(roles).toEqual([ROLES.ADMIN, ROLES.EMPLOYEE]);
});
