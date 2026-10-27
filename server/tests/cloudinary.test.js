import fs from 'fs';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { PROFILE_PICTURES_DIR } from '../src/services/fileStorageService.js';
import { signParams, ownedPublicIdFromUrl } from '../src/services/cloudinaryService.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
// A fake account — the real one is blanked in setupEnv.js and never reached.
const FAKE = { cloudName: 'testcloud', apiKey: '111', apiSecret: 'not-a-real-secret', folder: 'zorx_hrms', enabled: true };

async function setup(role, email) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: role, lastName: 'Test', joiningDate: new Date('2025-01-01') });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}
const upload = (token, id) => request(app).post(`/api/employees/${id}/profile-picture`).set('Authorization', `Bearer ${token}`).attach('file', TINY_PNG, { filename: 'me.png', contentType: 'image/png' });

const realFetch = globalThis.fetch;
const realConfig = { ...env.cloudinary };
let calls;
let failUpload;
let localBefore;

beforeAll(async () => {
  await startTestDb();
});
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  Object.assign(env.cloudinary, FAKE);
  calls = [];
  failUpload = false;
  localBefore = new Set(fs.readdirSync(PROFILE_PICTURES_DIR));
  globalThis.fetch = async (url, init) => {
    const form = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `<file ${v.size}b ${v.type}>`]));
    calls.push({ url: String(url), form });
    if (String(url).endsWith('/image/upload')) {
      if (failUpload) return new Response(JSON.stringify({ error: { message: 'Invalid Signature' } }), { status: 401 });
      const n = calls.length;
      return new Response(JSON.stringify({ secure_url: `https://res.cloudinary.com/testcloud/image/upload/v17000${n}/${form.folder}/${form.public_id}.png`, public_id: `${form.folder}/${form.public_id}` }), { status: 200 });
    }
    return new Response(JSON.stringify({ result: 'ok' }), { status: 200 });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(env.cloudinary, realConfig);
  for (const f of fs.readdirSync(PROFILE_PICTURES_DIR)) if (!localBefore.has(f)) fs.unlinkSync(`${PROFILE_PICTURES_DIR}/${f}`);
});

describe('signing and ownership', () => {
  test("signature matches Cloudinary's documented example", () => {
    expect(signParams({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 }, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  test('only images in our own cloud and folder are treated as ours', () => {
    expect(ownedPublicIdFromUrl('https://res.cloudinary.com/testcloud/image/upload/v123/zorx_hrms/profile-pictures/abc.png')).toBe('zorx_hrms/profile-pictures/abc');
    expect(ownedPublicIdFromUrl('https://res.cloudinary.com/testcloud/image/upload/zorx_hrms/profile-pictures/abc.jpg')).toBe('zorx_hrms/profile-pictures/abc');
    expect(ownedPublicIdFromUrl('https://res.cloudinary.com/othercloud/image/upload/v1/zorx_hrms/x.png')).toBeNull();
    expect(ownedPublicIdFromUrl('https://res.cloudinary.com/testcloud/image/upload/v1/other_folder/x.png')).toBeNull();
    expect(ownedPublicIdFromUrl('https://api.zorxindia.online/uploads/profile-pictures/x.png')).toBeNull();
    expect(ownedPublicIdFromUrl('/profile/ihsan.jpeg')).toBeNull();
    expect(ownedPublicIdFromUrl('')).toBeNull();
  });
});

describe('profile pictures on Cloudinary', () => {
  test('upload goes to zorx_hrms/profile-pictures, signed, and only the Cloudinary URL is stored', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const res = await upload(admin.token, emp.employee._id);
    expect(res.status).toBe(200);
    const [call] = calls;
    expect(call.url).toBe('https://api.cloudinary.com/v1_1/testcloud/image/upload');
    expect(call.form).toMatchObject({ folder: 'zorx_hrms/profile-pictures', api_key: '111', overwrite: 'false', file: `<file ${TINY_PNG.length}b image/png>` });
    expect(call.form.signature).toBe(signParams({ folder: call.form.folder, public_id: call.form.public_id, overwrite: 'false', timestamp: call.form.timestamp }, FAKE.apiSecret));
    expect(JSON.stringify(call.form)).not.toContain(FAKE.apiSecret);
    const saved = await Employee.findById(emp.employee._id);
    expect(saved.profileImage).toMatch(/^https:\/\/res\.cloudinary\.com\/testcloud\/image\/upload\/v\d+\/zorx_hrms\/profile-pictures\/[0-9a-f-]+\.png$/);
    expect(res.body.data.profileImage).toBe(saved.profileImage);
    // The temporary local copy is removed.
    expect(fs.readdirSync(PROFILE_PICTURES_DIR).filter((f) => !localBefore.has(f))).toHaveLength(0);
  });

  test('replacing a picture deletes the previous Cloudinary image, never seed or other images', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    await Employee.findByIdAndUpdate(emp.employee._id, { profileImage: '/profile/ihsan.jpeg' });
    await upload(admin.token, emp.employee._id);
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['upload']); // seed image untouched
    const first = (await Employee.findById(emp.employee._id)).profileImage;
    await upload(admin.token, emp.employee._id);
    const destroy = calls.find((c) => c.url.endsWith('/image/destroy'));
    expect(destroy.form.public_id).toBe(ownedPublicIdFromUrl(first));
    expect((await Employee.findById(emp.employee._id)).profileImage).not.toBe(first);
  });

  test('if Cloudinary fails, the employee keeps the old picture and no file is left behind', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    await Employee.findByIdAndUpdate(emp.employee._id, { profileImage: '/profile/ihsan.jpeg' });
    failUpload = true;
    const res = await upload(admin.token, emp.employee._id);
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('Could not store the image right now. Please try again.');
    expect(JSON.stringify(res.body)).not.toMatch(/Invalid Signature|not-a-real-secret/);
    expect((await Employee.findById(emp.employee._id)).profileImage).toBe('/profile/ihsan.jpeg');
    expect(fs.readdirSync(PROFILE_PICTURES_DIR).filter((f) => !localBefore.has(f))).toHaveLength(0);
  });

  test('only HR/Admin can upload; non-images are rejected before reaching Cloudinary', async () => {
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    expect((await upload(emp.token, emp.employee._id)).status).toBe(403);
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const bad = await request(app).post(`/api/employees/${emp.employee._id}/profile-picture`).set('Authorization', `Bearer ${admin.token}`).attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test('without Cloudinary configured, the existing disk storage is still used', async () => {
    Object.assign(env.cloudinary, { enabled: false });
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const res = await upload(admin.token, emp.employee._id);
    expect(res.status).toBe(200);
    expect(res.body.data.profileImage).toMatch(/\/uploads\/profile-pictures\/[0-9a-f-]+\.png$/);
    expect(calls).toHaveLength(0);
  });
});
