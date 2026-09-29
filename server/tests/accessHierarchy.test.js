import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { ContentCalendarItem } from '../src/models/ContentCalendarItem.js';
import { Notification } from '../src/models/Notification.js';
import { getEffectivePermissions, hasPermission } from '../src/utils/permissions.js';
import { ROLES, PERMISSIONS } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';

async function createUser(role, email, permissions = []) {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role, permissions });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`,
    firstName: role,
    lastName: 'Test',
    joiningDate: new Date('2025-01-01'),
  });
  user.employeeId = employee._id;
  await user.save();
  return { user, employee };
}

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: DEV_PASSWORD });
  return res.body.data.token;
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

describe('getEffectivePermissions / hasPermission', () => {
  test('SUPER_ADMIN gets view+manage from role defaults alone', () => {
    const perms = getEffectivePermissions({ role: ROLES.SUPER_ADMIN, permissions: [] });
    expect(perms).toEqual(expect.arrayContaining([PERMISSIONS.CONTENT_CALENDAR_VIEW, PERMISSIONS.CONTENT_CALENDAR_MANAGE]));
  });

  test('ADMIN gets view only by default', () => {
    const perms = getEffectivePermissions({ role: ROLES.ADMIN, permissions: [] });
    expect(perms).toContain(PERMISSIONS.CONTENT_CALENDAR_VIEW);
    expect(perms).not.toContain(PERMISSIONS.CONTENT_CALENDAR_MANAGE);
  });

  test('a plain EMPLOYEE is view-only', () => {
    expect(hasPermission({ role: ROLES.EMPLOYEE, permissions: [] }, PERMISSIONS.CONTENT_CALENDAR_MANAGE)).toBe(false);
    expect(hasPermission({ role: ROLES.EMPLOYEE, permissions: [] }, PERMISSIONS.CONTENT_CALENDAR_VIEW)).toBe(true);
  });

  test('a Creator (EMPLOYEE + explicit grant) gets manage without a separate role', () => {
    const perms = getEffectivePermissions({ role: ROLES.EMPLOYEE, permissions: [PERMISSIONS.CONTENT_CALENDAR_MANAGE] });
    expect(perms).toEqual(expect.arrayContaining([PERMISSIONS.CONTENT_CALENDAR_VIEW, PERMISSIONS.CONTENT_CALENDAR_MANAGE]));
  });
});

describe('SUPER_ADMIN attendance restrictions', () => {
  test('can view all attendance', async () => {
    const { user } = await createUser(ROLES.SUPER_ADMIN, 'sa1@zorx.test');
    const token = await login(user.email);
    const res = await request(app).get('/api/attendance').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('cannot check in', async () => {
    const { user } = await createUser(ROLES.SUPER_ADMIN, 'sa2@zorx.test');
    const token = await login(user.email);
    const res = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 10.99, longitude: 76.44 });
    expect(res.status).toBe(403);
  });

  test('cannot check out', async () => {
    const { user } = await createUser(ROLES.SUPER_ADMIN, 'sa3@zorx.test');
    const token = await login(user.email);
    const res = await request(app)
      .post('/api/attendance/check-out')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 10.99, longitude: 76.44 });
    expect(res.status).toBe(403);
  });
});

describe('HR/ADMIN attendance access', () => {
  test('can check in and check out', async () => {
    const { user } = await createUser(ROLES.ADMIN, 'hr1@zorx.test');
    const token = await login(user.email);

    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 10.991401, longitude: 76.442772 });
    expect(checkInRes.status).toBe(200);

    const checkOutRes = await request(app)
      .post('/api/attendance/check-out')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 10.991401, longitude: 76.442772 });
    expect(checkOutRes.status).toBe(200);
  });

  test('can view employee attendance', async () => {
    const { user } = await createUser(ROLES.ADMIN, 'hr2@zorx.test');
    const token = await login(user.email);
    const res = await request(app).get('/api/attendance').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('Content Calendar — SUPER_ADMIN full access', () => {
  test('can create, edit, and delete', async () => {
    const { user: admin } = await createUser(ROLES.SUPER_ADMIN, 'sa-cc@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-cc1@zorx.test');
    const token = await login(admin.email);

    const createRes = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client: 'Acme Corp',
        date: '2026-10-01',
        assignedEmployee: employee._id.toString(),
        work: 'Instagram reel',
        deadline: '2026-10-05',
      });
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.data._id;

    const editRes = await request(app)
      .patch(`/api/content-calendar/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workStatus: 'ONGOING' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.workStatus).toBe('ONGOING');

    const deleteRes = await request(app).delete(`/api/content-calendar/${itemId}`).set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);
  });

  test('assignedBy is always the authenticated user, never client-supplied', async () => {
    const { user: admin } = await createUser(ROLES.SUPER_ADMIN, 'sa-cc2@zorx.test');
    const { user: otherUser } = await createUser(ROLES.ADMIN, 'someone-else@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-cc2@zorx.test');
    const token = await login(admin.email);

    const res = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client: 'Acme Corp',
        date: '2026-10-01',
        assignedEmployee: employee._id.toString(),
        work: 'Reel',
        deadline: '2026-10-05',
        assignedBy: otherUser._id.toString(), // attempted spoof
      });

    expect(res.status).toBe(201);
    expect(res.body.data.assignedBy._id).toBe(admin._id.toString());
  });
});

describe('Content Calendar — HR view-only', () => {
  test('can view but cannot create, edit, or delete', async () => {
    const { user: hr } = await createUser(ROLES.ADMIN, 'hr-cc@zorx.test');
    const { user: creator, employee: creatorEmployee } = await createUser(ROLES.EMPLOYEE, 'creator-seed@zorx.test', [
      PERMISSIONS.CONTENT_CALENDAR_MANAGE,
    ]);
    const { employee: assignee } = await createUser(ROLES.EMPLOYEE, 'emp-cc3@zorx.test');
    const creatorToken = await login(creator.email);
    const hrToken = await login(hr.email);

    const seedRes = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ client: 'Acme', date: '2026-10-01', assignedEmployee: assignee._id.toString(), work: 'Post', deadline: '2026-10-05' });
    const itemId = seedRes.body.data._id;

    const viewRes = await request(app).get('/api/content-calendar').set('Authorization', `Bearer ${hrToken}`);
    expect(viewRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ client: 'Acme', date: '2026-10-01', assignedEmployee: assignee._id.toString(), work: 'Post', deadline: '2026-10-05' });
    expect(createRes.status).toBe(403);

    const editRes = await request(app)
      .patch(`/api/content-calendar/${itemId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ workStatus: 'ONGOING' });
    expect(editRes.status).toBe(403);

    const deleteRes = await request(app).delete(`/api/content-calendar/${itemId}`).set('Authorization', `Bearer ${hrToken}`);
    expect(deleteRes.status).toBe(403);

    void creatorEmployee;
  });
});

describe('Content Calendar — Creator (EMPLOYEE + CONTENT_CALENDAR_MANAGE)', () => {
  test('full CRUD + status updates, but no admin-only employee management or super-admin-only settings', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'creator1@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee: assignee } = await createUser(ROLES.EMPLOYEE, 'emp-cc4@zorx.test');
    const token = await login(creator.email);

    // Check in / check out like a normal employee.
    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 10.991401, longitude: 76.442772 });
    expect(checkInRes.status).toBe(200);

    // Create
    const createRes = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({ client: 'Acme', date: '2026-10-01', assignedEmployee: assignee._id.toString(), work: 'Post', deadline: '2026-10-05' });
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.data._id;

    // Edit (status/priority/deadline/remarks/feedback)
    const editRes = await request(app)
      .patch(`/api/content-calendar/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workStatus: 'COMPLETED', priority: 'HIGH', clientFeedback: 'Loved it' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.workStatus).toBe('COMPLETED');
    expect(editRes.body.data.clientFeedback).toBe('Loved it');

    // Delete
    const deleteRes = await request(app).delete(`/api/content-calendar/${itemId}`).set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    // Cannot access admin-only employee management
    const employeesRes = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);
    expect(employeesRes.status).toBe(403);

    // Cannot access super-admin-only office settings
    const settingsRes = await request(app)
      .patch('/api/settings/office')
      .set('Authorization', `Bearer ${token}`)
      .send({ attendanceRadius: 500 });
    expect(settingsRes.status).toBe(403);
  });
});

describe('Content Calendar — plain EMPLOYEE view-only', () => {
  test('can view but cannot mutate', async () => {
    const { user: employeeUser } = await createUser(ROLES.EMPLOYEE, 'plain-emp@zorx.test');
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'creator2@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee: assignee } = await createUser(ROLES.EMPLOYEE, 'emp-cc5@zorx.test');
    const creatorToken = await login(creator.email);
    const employeeToken = await login(employeeUser.email);

    const seedRes = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ client: 'Acme', date: '2026-10-01', assignedEmployee: assignee._id.toString(), work: 'Post', deadline: '2026-10-05' });
    const itemId = seedRes.body.data._id;

    // Check in / check out like a normal employee.
    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ latitude: 10.991401, longitude: 76.442772 });
    expect(checkInRes.status).toBe(200);

    const viewRes = await request(app).get('/api/content-calendar').set('Authorization', `Bearer ${employeeToken}`);
    expect(viewRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ client: 'Acme', date: '2026-10-01', assignedEmployee: assignee._id.toString(), work: 'Post', deadline: '2026-10-05' });
    expect(createRes.status).toBe(403);

    const editRes = await request(app)
      .patch(`/api/content-calendar/${itemId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ workStatus: 'ONGOING' });
    expect(editRes.status).toBe(403);

    const deleteRes = await request(app).delete(`/api/content-calendar/${itemId}`).set('Authorization', `Bearer ${employeeToken}`);
    expect(deleteRes.status).toBe(403);
  });

  test('unauthenticated requests get 401, not 403', async () => {
    const res = await request(app).get('/api/content-calendar');
    expect(res.status).toBe(401);
  });
});

describe('Content Calendar notifications', () => {
  test('assigning work creates a persisted notification for the assignee', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'creator3@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { user: assigneeUser, employee: assignee } = await createUser(ROLES.EMPLOYEE, 'emp-cc6@zorx.test');
    const token = await login(creator.email);

    const res = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({ client: 'Acme', date: '2026-10-01', assignedEmployee: assignee._id.toString(), work: 'Reel edit', deadline: '2026-10-05' });
    expect(res.status).toBe(201);

    const notifications = await Notification.find({ userId: assigneeUser._id });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('CONTENT_CALENDAR_ASSIGNED');
    expect(notifications[0].message).toContain('Reel edit');
  });

  test('assigning to yourself does not create a self-notification', async () => {
    const { user: creator, employee: creatorEmployee } = await createUser(ROLES.EMPLOYEE, 'creator4@zorx.test', [
      PERMISSIONS.CONTENT_CALENDAR_MANAGE,
    ]);
    const token = await login(creator.email);

    await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({ client: 'Acme', date: '2026-10-01', assignedEmployee: creatorEmployee._id.toString(), work: 'Self task', deadline: '2026-10-05' });

    const notifications = await Notification.find({ userId: creator._id });
    expect(notifications).toHaveLength(0);
  });
});

describe('Content Calendar validation', () => {
  test('rejects an assignedEmployee that does not exist', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'creator5@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const token = await login(creator.email);

    const res = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client: 'Acme',
        date: '2026-10-01',
        assignedEmployee: '000000000000000000000000',
        work: 'Reel',
        deadline: '2026-10-05',
      });
    expect(res.status).toBe(400);
  });

  test('rejects missing required fields', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'creator6@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const token = await login(creator.email);

    const res = await request(app).post('/api/content-calendar').set('Authorization', `Bearer ${token}`).send({ client: 'Acme' });
    expect(res.status).toBe(400);
  });

  const ensureDb = ContentCalendarItem; // referenced to keep the import used across the whole suite
  void ensureDb;
});

describe('Content Calendar search and assignable employees', () => {
  test('assignable employees endpoint returns active employees for content calendar users', async () => {
    const { user: empUser } = await createUser(ROLES.EMPLOYEE, 'emp-assignable@zorx.test');
    const token = await login(empUser.email);

    const res = await request(app).get('/api/content-calendar/employees').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('backend search works by employee name, client name, and work description', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'search-creator@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { user: shamilaUser, employee: shamilaEmp } = await createUser(ROLES.EMPLOYEE, 'shamila@zorx.test');
    shamilaEmp.firstName = 'Shamila';
    shamilaEmp.lastName = 'Begum';
    await shamilaEmp.save();

    const { employee: johnEmp } = await createUser(ROLES.EMPLOYEE, 'john@zorx.test');
    johnEmp.firstName = 'John';
    johnEmp.lastName = 'Doe';
    await johnEmp.save();

    const token = await login(creator.email);

    // Create item 1: assigned to Shamila, client: Apex Global, work: YouTube Video
    await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client: 'Apex Global',
        date: '2026-10-01',
        assignedEmployee: shamilaEmp._id.toString(),
        work: 'YouTube Video',
        deadline: '2026-10-05',
      });

    // Create item 2: assigned to John, client: Zenith Corp, work: Instagram Campaign
    await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client: 'Zenith Corp',
        date: '2026-10-02',
        assignedEmployee: johnEmp._id.toString(),
        work: 'Instagram Campaign',
        deadline: '2026-10-06',
      });

    // Search A: Employee name "shamila" (case-insensitive)
    const empSearch = await request(app).get('/api/content-calendar?search=shamila').set('Authorization', `Bearer ${token}`);
    expect(empSearch.status).toBe(200);
    expect(empSearch.body.data).toHaveLength(1);
    expect(empSearch.body.data[0].assignedEmployee.firstName).toBe('Shamila');

    // Search B: Client name "Zenith"
    const clientSearch = await request(app).get('/api/content-calendar?search=Zenith').set('Authorization', `Bearer ${token}`);
    expect(clientSearch.status).toBe(200);
    expect(clientSearch.body.data).toHaveLength(1);
    expect(clientSearch.body.data[0].client).toBe('Zenith Corp');

    // Search C: Work name "YouTube"
    const workSearch = await request(app).get('/api/content-calendar?search=YouTube').set('Authorization', `Bearer ${token}`);
    expect(workSearch.status).toBe(200);
    expect(workSearch.body.data).toHaveLength(1);
    expect(workSearch.body.data[0].work).toBe('YouTube Video');

    // Search D: Non-matching term
    const noMatch = await request(app).get('/api/content-calendar?search=NonExistentCompany').set('Authorization', `Bearer ${token}`);
    expect(noMatch.status).toBe(200);
    expect(noMatch.body.data).toHaveLength(0);

    void shamilaUser;
  });
});
