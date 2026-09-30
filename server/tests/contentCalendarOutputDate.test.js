import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Client } from '../src/models/Client.js';
import { ContentCalendarItem } from '../src/models/ContentCalendarItem.js';
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

describe('Assignment Date, Deadline, and Output Date are three independent business dates', () => {
  test('creating a new item without outputDate is rejected (400), not silently defaulted', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'c1@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp1@zorx.test');
    const token = await login(creator.email);

    const res = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({ client: 'Acme', date: '2026-09-30', deadline: '2026-10-01', assignedEmployee: employee._id.toString(), work: 'Reel' });
    // No outputDate supplied at all.
    expect(res.status).toBe(400);
  });

  test('the three dates are stored as distinct values and never copied into one another', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'c2@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp2@zorx.test');
    const token = await login(creator.email);

    const res = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client: 'Acme',
        date: '2026-09-30', // Assignment Date
        deadline: '2026-10-01', // Deadline
        outputDate: '2026-10-02', // Output Date
        assignedEmployee: employee._id.toString(),
        work: 'Reel',
      });

    expect(res.status).toBe(201);
    expect(new Date(res.body.data.date).toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(new Date(res.body.data.deadline).toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(new Date(res.body.data.outputDate).toISOString().slice(0, 10)).toBe('2026-10-02');
  });

  test('changing Assignment Date or Deadline does not alter Output Date', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'c3@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp3@zorx.test');
    const token = await login(creator.email);

    const createRes = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client: 'Acme',
        date: '2026-09-30',
        deadline: '2026-10-01',
        outputDate: '2026-10-02',
        assignedEmployee: employee._id.toString(),
        work: 'Reel',
      });
    const itemId = createRes.body.data._id;

    const updateRes = await request(app)
      .patch(`/api/content-calendar/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-08-15', deadline: '2026-08-20' });

    expect(updateRes.status).toBe(200);
    expect(new Date(updateRes.body.data.date).toISOString().slice(0, 10)).toBe('2026-08-15');
    expect(new Date(updateRes.body.data.deadline).toISOString().slice(0, 10)).toBe('2026-08-20');
    // Output Date must be untouched by editing the other two dates.
    expect(new Date(updateRes.body.data.outputDate).toISOString().slice(0, 10)).toBe('2026-10-02');
  });

  test('changing Output Date does not alter Assignment Date or Deadline', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'c4@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp4@zorx.test');
    const token = await login(creator.email);

    const createRes = await request(app)
      .post('/api/content-calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client: 'Acme',
        date: '2026-09-30',
        deadline: '2026-10-01',
        outputDate: '2026-10-02',
        assignedEmployee: employee._id.toString(),
        work: 'Reel',
      });
    const itemId = createRes.body.data._id;

    const updateRes = await request(app)
      .patch(`/api/content-calendar/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outputDate: '2026-10-25' });

    expect(updateRes.status).toBe(200);
    expect(new Date(updateRes.body.data.outputDate).toISOString().slice(0, 10)).toBe('2026-10-25');
    expect(new Date(updateRes.body.data.date).toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(new Date(updateRes.body.data.deadline).toISOString().slice(0, 10)).toBe('2026-10-01');
  });
});

describe('Legacy records (created before outputDate existed) are handled safely', () => {
  test('a legacy document without outputDate can still be read back with outputDate as null', async () => {
    const client = await Client.create({ name: 'Legacy Client' });
    const { employee } = await createUser(ROLES.EMPLOYEE, 'legacy-emp@zorx.test');
    const { user: admin } = await createUser(ROLES.SUPER_ADMIN, 'legacy-admin@zorx.test');

    // Simulate a pre-existing production record, created directly at the
    // model level the way it would have existed before this migration —
    // no outputDate field at all.
    const legacyItem = await ContentCalendarItem.create({
      clientId: client._id,
      client: client.name,
      date: new Date('2026-01-10'),
      deadline: new Date('2026-01-12'),
      assignedEmployee: employee._id,
      work: 'Old legacy work item',
      assignedBy: admin._id,
    });
    expect(legacyItem.outputDate).toBeNull();

    const token = await login(admin.email);
    const res = await request(app).get(`/api/content-calendar/${legacyItem._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.outputDate).toBeNull();
  });

  test('editing an unrelated field on a legacy record does not require backfilling outputDate', async () => {
    const client = await Client.create({ name: 'Legacy Client 2' });
    const { employee } = await createUser(ROLES.EMPLOYEE, 'legacy-emp2@zorx.test');
    const { user: admin } = await createUser(ROLES.SUPER_ADMIN, 'legacy-admin2@zorx.test');

    const legacyItem = await ContentCalendarItem.create({
      clientId: client._id,
      client: client.name,
      date: new Date('2026-01-10'),
      deadline: new Date('2026-01-12'),
      assignedEmployee: employee._id,
      work: 'Old legacy work item',
      assignedBy: admin._id,
    });

    const token = await login(admin.email);
    const res = await request(app)
      .patch(`/api/content-calendar/${legacyItem._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workStatus: 'ONGOING' }); // no outputDate supplied

    expect(res.status).toBe(200);
    expect(res.body.data.workStatus).toBe('ONGOING');
    expect(res.body.data.outputDate).toBeNull(); // still not silently invented
  });

  test('a legacy record can have its outputDate deliberately backfilled via a normal update', async () => {
    const client = await Client.create({ name: 'Legacy Client 3' });
    const { employee } = await createUser(ROLES.EMPLOYEE, 'legacy-emp3@zorx.test');
    const { user: admin } = await createUser(ROLES.SUPER_ADMIN, 'legacy-admin3@zorx.test');

    const legacyItem = await ContentCalendarItem.create({
      clientId: client._id,
      client: client.name,
      date: new Date('2026-01-10'),
      deadline: new Date('2026-01-12'),
      assignedEmployee: employee._id,
      work: 'Old legacy work item',
      assignedBy: admin._id,
    });

    const token = await login(admin.email);
    const res = await request(app)
      .patch(`/api/content-calendar/${legacyItem._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outputDate: '2026-02-01' });

    expect(res.status).toBe(200);
    expect(new Date(res.body.data.outputDate).toISOString().slice(0, 10)).toBe('2026-02-01');
  });
});
