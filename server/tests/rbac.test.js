import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';

async function createUser(role, email) {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${role}`,
    firstName: role,
    lastName: 'Test',
    joiningDate: new Date(),
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

describe('authentication', () => {
  test('rejects requests without a token', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
  });

  test('rejects invalid credentials', async () => {
    await createUser(ROLES.EMPLOYEE, 'emp@zorx.test');
    const res = await request(app).post('/api/auth/login').send({ email: 'emp@zorx.test', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('allows login with correct credentials and returns a token', async () => {
    await createUser(ROLES.EMPLOYEE, 'emp2@zorx.test');
    const res = await request(app).post('/api/auth/login').send({ email: 'emp2@zorx.test', password: DEV_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });
});

describe('role-based authorization', () => {
  test('EMPLOYEE cannot list all employees', async () => {
    await createUser(ROLES.EMPLOYEE, 'emp3@zorx.test');
    const token = await login('emp3@zorx.test');
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('ADMIN can list all employees', async () => {
    await createUser(ROLES.ADMIN, 'admin1@zorx.test');
    const token = await login('admin1@zorx.test');
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('EMPLOYEE cannot approve leave', async () => {
    await createUser(ROLES.EMPLOYEE, 'emp4@zorx.test');
    const token = await login('emp4@zorx.test');
    const res = await request(app)
      .patch('/api/leaves/000000000000000000000000/approve')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test('EMPLOYEE cannot update office settings', async () => {
    await createUser(ROLES.EMPLOYEE, 'emp5@zorx.test');
    const token = await login('emp5@zorx.test');
    const res = await request(app)
      .patch('/api/settings/office')
      .set('Authorization', `Bearer ${token}`)
      .send({ attendanceRadius: 500 });
    expect(res.status).toBe(403);
  });

  test('SUPER_ADMIN can update office settings', async () => {
    await createUser(ROLES.SUPER_ADMIN, 'sa1@zorx.test');
    const token = await login('sa1@zorx.test');
    const res = await request(app)
      .patch('/api/settings/office')
      .set('Authorization', `Bearer ${token}`)
      .send({ attendanceRadius: 500 });
    expect(res.status).toBe(200);
    expect(res.body.data.attendanceRadius).toBe(500);
  });
});
