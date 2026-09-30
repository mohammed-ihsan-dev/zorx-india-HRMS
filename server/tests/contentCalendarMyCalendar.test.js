import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { ROLES, PERMISSIONS } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';

async function createUser(role, email, permissions = [], names = { firstName: role, lastName: 'Test' }) {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role, permissions });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`,
    firstName: names.firstName,
    lastName: names.lastName,
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

async function assignWork(creatorToken, { assignedEmployeeId, client, work, date, deadline, outputDate }) {
  return request(app)
    .post('/api/content-calendar')
    .set('Authorization', `Bearer ${creatorToken}`)
    .send({ client, date, assignedEmployee: assignedEmployeeId, work, deadline, outputDate });
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

describe('My Calendar — server-side employee scoping (via existing assignedEmployee filter)', () => {
  test('Employee A requesting assignedEmployee=A only sees A\'s records, never B\'s', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'mc-creator@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { user: empA, employee: employeeA } = await createUser(ROLES.EMPLOYEE, 'mc-empA@zorx.test', [], {
      firstName: 'Mohammed',
      lastName: 'Ihsan',
    });
    const { employee: employeeB } = await createUser(ROLES.EMPLOYEE, 'mc-empB@zorx.test', [], { firstName: 'Shamila', lastName: 'Sherin' });
    const creatorToken = await login(creator.email);
    const tokenA = await login(empA.email);

    await assignWork(creatorToken, {
      assignedEmployeeId: employeeA._id.toString(),
      client: 'Acme',
      work: 'Reel for Acme',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-02',
    });
    await assignWork(creatorToken, {
      assignedEmployeeId: employeeB._id.toString(),
      client: 'Globex',
      work: 'Post for Globex',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-03',
    });

    const res = await request(app)
      .get('/api/content-calendar')
      .query({ assignedEmployee: employeeA._id.toString() })
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].work).toBe('Reel for Acme');
    expect(res.body.data[0].assignedEmployee._id).toBe(employeeA._id.toString());
  });

  test('Employee B requesting assignedEmployee=B only sees B\'s records, never A\'s', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'mc-creator2@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee: employeeA } = await createUser(ROLES.EMPLOYEE, 'mc-empA2@zorx.test', [], { firstName: 'Mohammed', lastName: 'Ihsan' });
    const { user: empB, employee: employeeB } = await createUser(ROLES.EMPLOYEE, 'mc-empB2@zorx.test', [], {
      firstName: 'Shamila',
      lastName: 'Sherin',
    });
    const creatorToken = await login(creator.email);
    const tokenB = await login(empB.email);

    await assignWork(creatorToken, {
      assignedEmployeeId: employeeA._id.toString(),
      client: 'Acme',
      work: 'Reel for Acme',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-02',
    });
    await assignWork(creatorToken, {
      assignedEmployeeId: employeeB._id.toString(),
      client: 'Globex',
      work: 'Post for Globex',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-03',
    });

    const res = await request(app)
      .get('/api/content-calendar')
      .query({ assignedEmployee: employeeB._id.toString() })
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].work).toBe('Post for Globex');
  });

  test('omitting assignedEmployee (Full Calendar) returns every permitted record, unchanged from existing behavior', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'mc-creator3@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee: employeeA } = await createUser(ROLES.EMPLOYEE, 'mc-empA3@zorx.test');
    const { employee: employeeB } = await createUser(ROLES.EMPLOYEE, 'mc-empB3@zorx.test');
    const creatorToken = await login(creator.email);

    await assignWork(creatorToken, {
      assignedEmployeeId: employeeA._id.toString(),
      client: 'Acme',
      work: 'Reel for Acme',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-02',
    });
    await assignWork(creatorToken, {
      assignedEmployeeId: employeeB._id.toString(),
      client: 'Globex',
      work: 'Post for Globex',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-03',
    });

    const res = await request(app).get('/api/content-calendar').set('Authorization', `Bearer ${creatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  test('Full Calendar + Employee filter (switching to another employee) returns exactly that employee\'s records', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'mc-creator4@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee: employeeA } = await createUser(ROLES.EMPLOYEE, 'mc-empA4@zorx.test', [], { firstName: 'Mishab', lastName: 'K' });
    const { employee: employeeB } = await createUser(ROLES.EMPLOYEE, 'mc-empB4@zorx.test', [], { firstName: 'Shamila', lastName: 'S' });
    const creatorToken = await login(creator.email);

    await assignWork(creatorToken, {
      assignedEmployeeId: employeeA._id.toString(),
      client: 'Acme',
      work: 'Mishab work',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-02',
    });
    await assignWork(creatorToken, {
      assignedEmployeeId: employeeB._id.toString(),
      client: 'Globex',
      work: 'Shamila work',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-03',
    });

    const asShamila = await request(app)
      .get('/api/content-calendar')
      .query({ assignedEmployee: employeeB._id.toString() })
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(asShamila.body.data).toHaveLength(1);
    expect(asShamila.body.data[0].work).toBe('Shamila work');

    const asMishab = await request(app)
      .get('/api/content-calendar')
      .query({ assignedEmployee: employeeA._id.toString() })
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(asMishab.body.data).toHaveLength(1);
    expect(asMishab.body.data[0].work).toBe('Mishab work');
  });

  test('search composes correctly with the employee scope — searching another employee\'s name while scoped returns nothing', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'mc-creator5@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { user: empA, employee: employeeA } = await createUser(ROLES.EMPLOYEE, 'mc-empA5@zorx.test', [], {
      firstName: 'Mohammed',
      lastName: 'Ihsan',
    });
    const { employee: employeeB } = await createUser(ROLES.EMPLOYEE, 'mc-empB5@zorx.test', [], { firstName: 'Shamila', lastName: 'Sherin' });
    const creatorToken = await login(creator.email);
    const tokenA = await login(empA.email);

    await assignWork(creatorToken, {
      assignedEmployeeId: employeeA._id.toString(),
      client: 'Acme',
      work: 'Instagram reel',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-02',
    });
    await assignWork(creatorToken, {
      assignedEmployeeId: employeeB._id.toString(),
      client: 'Globex',
      work: 'Instagram post',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-03',
    });

    // Searching a term that matches BOTH records' work description, but scope is locked to A.
    const scopedSearch = await request(app)
      .get('/api/content-calendar')
      .query({ assignedEmployee: employeeA._id.toString(), search: 'Instagram' })
      .set('Authorization', `Bearer ${tokenA}`);
    expect(scopedSearch.body.data).toHaveLength(1);
    expect(scopedSearch.body.data[0].work).toBe('Instagram reel');

    // Searching for the OTHER employee's name while scoped to A must return nothing —
    // it must never leak B's record just because the search term matches B's name.
    const crossEmployeeSearch = await request(app)
      .get('/api/content-calendar')
      .query({ assignedEmployee: employeeA._id.toString(), search: 'Shamila' })
      .set('Authorization', `Bearer ${tokenA}`);
    expect(crossEmployeeSearch.body.data).toHaveLength(0);
  });

  test('pagination meta reflects only the scoped employee\'s count, not the full dataset', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'mc-creator6@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { employee: employeeA } = await createUser(ROLES.EMPLOYEE, 'mc-empA6@zorx.test');
    const { employee: employeeB } = await createUser(ROLES.EMPLOYEE, 'mc-empB6@zorx.test');
    const creatorToken = await login(creator.email);

    for (let i = 0; i < 3; i += 1) {
      await assignWork(creatorToken, {
        assignedEmployeeId: employeeA._id.toString(),
        client: 'Acme',
        work: `A work ${i}`,
        date: '2026-09-30',
        deadline: '2026-10-01',
        outputDate: '2026-10-02',
      });
    }
    await assignWork(creatorToken, {
      assignedEmployeeId: employeeB._id.toString(),
      client: 'Globex',
      work: 'B work',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-03',
    });

    const res = await request(app)
      .get('/api/content-calendar')
      .query({ assignedEmployee: employeeA._id.toString(), limit: 2, page: 1 })
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.body.data).toHaveLength(2); // page 1 of the scoped dataset, not all 4 records
    expect(res.body.meta.total).toBe(3); // total reflects only A's 3 records, filtered before pagination
  });

  test('Output Date is preserved and correct on scoped records (no regression from employee scoping)', async () => {
    const { user: creator } = await createUser(ROLES.EMPLOYEE, 'mc-creator7@zorx.test', [PERMISSIONS.CONTENT_CALENDAR_MANAGE]);
    const { user: empA, employee: employeeA } = await createUser(ROLES.EMPLOYEE, 'mc-empA7@zorx.test');
    const creatorToken = await login(creator.email);
    const tokenA = await login(empA.email);

    await assignWork(creatorToken, {
      assignedEmployeeId: employeeA._id.toString(),
      client: 'Acme',
      work: 'Reel',
      date: '2026-09-30',
      deadline: '2026-10-01',
      outputDate: '2026-10-25',
    });

    const res = await request(app)
      .get('/api/content-calendar')
      .query({ assignedEmployee: employeeA._id.toString() })
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.body.data).toHaveLength(1);
    expect(new Date(res.body.data[0].outputDate).toISOString().slice(0, 10)).toBe('2026-10-25');
    expect(new Date(res.body.data[0].date).toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(new Date(res.body.data[0].deadline).toISOString().slice(0, 10)).toBe('2026-10-01');
  });
});
