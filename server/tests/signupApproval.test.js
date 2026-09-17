import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const ADMIN_PASSWORD = 'Admin@12345';

async function createAdmin(email = 'admin@zorx.test') {
  const passwordHash = await User.hashPassword(ADMIN_PASSWORD);
  const user = await User.create({ email, passwordHash, role: ROLES.ADMIN, status: 'ACTIVE' });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${email}`,
    firstName: 'Admin',
    lastName: 'Test',
    joiningDate: new Date(),
  });
  user.employeeId = employee._id;
  await user.save();
  return user;
}

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res;
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

describe('signup', () => {
  const payload = {
    name: 'Priya Nair',
    email: 'priya@zorx.test',
    password: 'Password123',
    confirmPassword: 'Password123',
  };

  test('signup succeeds and creates a PENDING_APPROVAL user with a hashed password', async () => {
    const res = await request(app).post('/api/auth/signup').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/awaiting admin approval/i);

    const user = await User.findOne({ email: 'priya@zorx.test' }).select('+passwordHash');
    expect(user.status).toBe('PENDING_APPROVAL');
    expect(user.role).toBe('EMPLOYEE');
    expect(user.passwordHash).not.toBe('Password123');
    expect(user.passwordHash.startsWith('$2')).toBe(true); // bcrypt hash prefix
  });

  test('rejects mismatched confirm password', async () => {
    const res = await request(app).post('/api/auth/signup').send({ ...payload, confirmPassword: 'Other123' });
    expect(res.status).toBe(400);
  });

  test('rejects duplicate email', async () => {
    await request(app).post('/api/auth/signup').send(payload);
    const res = await request(app).post('/api/auth/signup').send(payload);
    expect(res.status).toBe(409);
  });

  test('pending user cannot log in', async () => {
    await request(app).post('/api/auth/signup').send(payload);
    const res = await login(payload.email, payload.password);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/awaiting admin approval/i);
  });

  test('signup response and login response never include the password hash', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send(payload);
    expect(JSON.stringify(signupRes.body)).not.toMatch(/passwordHash|Password123/);

    await User.findOneAndUpdate({ email: payload.email }, { status: 'ACTIVE' });
    const loginRes = await login(payload.email, payload.password);
    expect(JSON.stringify(loginRes.body)).not.toMatch(/passwordHash/);
  });
});

describe('admin approval', () => {
  const payload = {
    name: 'Arjun Kumar',
    email: 'arjun@zorx.test',
    password: 'Password123',
    confirmPassword: 'Password123',
  };

  test('admin approval changes status to ACTIVE and the user can then log in', async () => {
    await createAdmin();
    const adminToken = (await login('admin@zorx.test', ADMIN_PASSWORD)).body.data.token;

    await request(app).post('/api/auth/signup').send(payload);
    const employee = await Employee.findOne({ firstName: 'Arjun' });

    const approveRes = await request(app)
      .patch(`/api/employees/${employee._id}/approve-account`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approveRes.status).toBe(200);

    const loginRes = await login(payload.email, payload.password);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeTruthy();
  });

  test('admin rejection changes status to REJECTED and the user cannot log in', async () => {
    await createAdmin();
    const adminToken = (await login('admin@zorx.test', ADMIN_PASSWORD)).body.data.token;

    await request(app).post('/api/auth/signup').send(payload);
    const employee = await Employee.findOne({ firstName: 'Arjun' });

    const rejectRes = await request(app)
      .patch(`/api/employees/${employee._id}/reject-account`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(rejectRes.status).toBe(200);

    const loginRes = await login(payload.email, payload.password);
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.message).toMatch(/not been approved/i);
  });

  test('suspended user cannot log in', async () => {
    await createAdmin();
    await request(app).post('/api/auth/signup').send(payload);
    await User.findOneAndUpdate({ email: payload.email }, { status: 'SUSPENDED' });

    const loginRes = await login(payload.email, payload.password);
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.message).toMatch(/suspended/i);
  });

  test('employee (non back-office) cannot approve accounts', async () => {
    await request(app).post('/api/auth/signup').send(payload);
    await User.findOneAndUpdate({ email: payload.email }, { status: 'ACTIVE' });
    const employeeToken = (await login(payload.email, payload.password)).body.data.token;

    const otherSignup = { ...payload, name: 'Other Person', email: 'other@zorx.test' };
    await request(app).post('/api/auth/signup').send(otherSignup);
    const otherEmployee = await Employee.findOne({ firstName: 'Other' });

    const res = await request(app)
      .patch(`/api/employees/${otherEmployee._id}/approve-account`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  test('listing employees never exposes passwordHash', async () => {
    await createAdmin();
    const adminToken = (await login('admin@zorx.test', ADMIN_PASSWORD)).body.data.token;
    await request(app).post('/api/auth/signup').send(payload);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
});
