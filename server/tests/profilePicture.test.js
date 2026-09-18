import fs from 'fs';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { PROFILE_PICTURES_DIR } from '../src/services/fileStorageService.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';

// A minimal valid 1x1 PNG (67 bytes) — small enough to keep the test fast,
// real enough that the actual file gets written to disk and served back.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function createUser(role, email) {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${role}-${Math.random().toString(36).slice(2, 7)}`,
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

describe('employee profile picture upload', () => {
  test('admin can upload a profile picture and it is persisted as a public URL on the employee record', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'admin-photo@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-photo@zorx.test');
    const token = await login(admin.email);

    const res = await request(app)
      .post(`/api/employees/${employee._id}/profile-picture`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.profileImage).toMatch(/\/uploads\/profile-pictures\/.+\.png$/);

    const updated = await Employee.findById(employee._id);
    expect(updated.profileImage).toBe(res.body.data.profileImage);

    // The file must actually exist on disk under the public profile-pictures directory.
    const storedFilename = updated.profileImage.split('/uploads/profile-pictures/').pop();
    const filePath = `${PROFILE_PICTURES_DIR}/${storedFilename}`;
    expect(fs.existsSync(filePath)).toBe(true);
    fs.unlinkSync(filePath); // test cleanup — never leave uploaded test files behind
  });

  test('rejects a non-image file', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'admin-photo2@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-photo2@zorx.test');
    const token = await login(admin.email);

    const res = await request(app)
      .post(`/api/employees/${employee._id}/profile-picture`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not an image'), { filename: 'malware.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);
  });

  test('EMPLOYEE role cannot upload another employee\'s profile picture', async () => {
    const { user: employeeUser, employee } = await createUser(ROLES.EMPLOYEE, 'emp-photo3@zorx.test');
    const token = await login(employeeUser.email);

    const res = await request(app)
      .post(`/api/employees/${employee._id}/profile-picture`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
  });

  test('the uploaded image is served back publicly without authentication', async () => {
    const { user: admin } = await createUser(ROLES.ADMIN, 'admin-photo4@zorx.test');
    const { employee } = await createUser(ROLES.EMPLOYEE, 'emp-photo4@zorx.test');
    const token = await login(admin.email);

    const uploadRes = await request(app)
      .post(`/api/employees/${employee._id}/profile-picture`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });

    const publicPath = new URL(uploadRes.body.data.profileImage).pathname;
    const fetchRes = await request(app).get(publicPath); // no Authorization header
    expect(fetchRes.status).toBe(200);
    expect(fetchRes.headers['content-type']).toMatch(/image\/png/);

    const storedFilename = publicPath.split('/uploads/profile-pictures/').pop();
    fs.unlinkSync(`${PROFILE_PICTURES_DIR}/${storedFilename}`); // test cleanup
  });
});
