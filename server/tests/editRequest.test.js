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
    employeeCode: `E-${email}`,
    firstName: role,
    lastName: 'Test',
    phone: '1111111111',
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

describe('edit requests', () => {
  test('employee can submit an edit request', async () => {
    await createUser(ROLES.EMPLOYEE, 'emp1@zorx.test');
    const token = await login('emp1@zorx.test');

    const res = await request(app)
      .post('/api/edit-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ field: 'PHONE', currentValue: '1111111111', requestedValue: '9999999999', reason: 'Number changed' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
  });

  test('employee cannot approve edit requests', async () => {
    await createUser(ROLES.EMPLOYEE, 'emp2@zorx.test');
    const token = await login('emp2@zorx.test');
    const res = await request(app)
      .patch('/api/edit-requests/000000000000000000000000/approve')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test('admin approving a PHONE request auto-applies the change to the employee record', async () => {
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp3@zorx.test');
    const empToken = await login('emp3@zorx.test');

    const createRes = await request(app)
      .post('/api/edit-requests')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ field: 'PHONE', currentValue: '1111111111', requestedValue: '9999999999', reason: 'Number changed' });
    const requestId = createRes.body.data._id;

    await createUser(ROLES.ADMIN, 'admin@zorx.test');
    const adminToken = await login('admin@zorx.test');

    const approveRes = await request(app)
      .patch(`/api/edit-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const updatedEmployee = await Employee.findById(employee._id);
    expect(updatedEmployee.phone).toBe('9999999999');
  });

  test('a request cannot be approved twice', async () => {
    await createUser(ROLES.EMPLOYEE, 'emp4@zorx.test');
    const empToken = await login('emp4@zorx.test');
    const createRes = await request(app)
      .post('/api/edit-requests')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ field: 'ADDRESS', currentValue: 'Old', requestedValue: 'New Address', reason: 'Moved house' });
    const requestId = createRes.body.data._id;

    await createUser(ROLES.ADMIN, 'admin2@zorx.test');
    const adminToken = await login('admin2@zorx.test');

    await request(app).patch(`/api/edit-requests/${requestId}/approve`).set('Authorization', `Bearer ${adminToken}`).send({});
    const secondAttempt = await request(app)
      .patch(`/api/edit-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(secondAttempt.status).toBe(400);
  });

  test('admin can reject a request with a reason and it is not applied', async () => {
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp5@zorx.test');
    const empToken = await login('emp5@zorx.test');
    const createRes = await request(app)
      .post('/api/edit-requests')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ field: 'PHONE', currentValue: '1111111111', requestedValue: '5555555555', reason: 'Test' });
    const requestId = createRes.body.data._id;

    await createUser(ROLES.ADMIN, 'admin3@zorx.test');
    const adminToken = await login('admin3@zorx.test');

    const rejectRes = await request(app)
      .patch(`/api/edit-requests/${requestId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewComment: 'Please contact HR directly.' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');

    const unchangedEmployee = await Employee.findById(employee._id);
    expect(unchangedEmployee.phone).toBe('1111111111');
  });
});

describe('profile documents', () => {
  test('employee cannot download another employee document', async () => {
    const { employee: ownerEmployee } = await createUser(ROLES.EMPLOYEE, 'owner@zorx.test');
    await createUser(ROLES.EMPLOYEE, 'other@zorx.test');
    const otherToken = await login('other@zorx.test');

    const { ProfileDocument } = await import('../src/models/ProfileDocument.js');
    const doc = await ProfileDocument.create({
      employeeId: ownerEmployee._id,
      uploadedBy: ownerEmployee.userId,
      documentType: 'ID_PROOF',
      originalFileName: 'id.pdf',
      storedFileName: 'nonexistent.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });

    const res = await request(app).get(`/api/documents/${doc._id}/download`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});
