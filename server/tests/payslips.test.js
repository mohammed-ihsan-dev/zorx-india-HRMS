import fs from 'fs';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { ProfileDocument } from '../src/models/ProfileDocument.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { UPLOADS_DIR } from '../src/services/fileStorageService.js';
import { ROLES } from '../src/utils/constants.js';

const app = createApp();
const PASSWORD = 'Test@12345';
const PDF_A = Buffer.from('%PDF-1.4\n% payslip A\n%%EOF');
const PDF_B = Buffer.from('%PDF-1.4\n% payslip B (corrected)\n%%EOF');
const PERIOD = '2026-09';

async function setup(role, email) {
  const user = await User.create({ email, passwordHash: await User.hashPassword(PASSWORD), role });
  const employee = await Employee.create({ userId: user._id, employeeCode: `E-${Math.random().toString(36).slice(2, 8)}`, firstName: email.split('@')[0], lastName: 'Test', joiningDate: new Date('2024-01-15') });
  user.employeeId = employee._id;
  await user.save();
  const token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;
  return { user, employee, token };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const upload = (token, { employeeId, period = PERIOD, replace, file = PDF_A, contentType = 'application/pdf', filename = 'payslip.pdf' }) => {
  const req = request(app).post('/api/documents/payslips').set(auth(token)).field('employeeId', String(employeeId)).field('period', period);
  if (replace) req.field('replace', 'true');
  return req.attach('file', file, { filename, contentType });
};
const download = (token, id) =>
  request(app).get(`/api/documents/${id}/download`).set(auth(token)).buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

let filesBefore;
beforeAll(async () => {
  await startTestDb();
});
afterAll(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  filesBefore = new Set(fs.readdirSync(UPLOADS_DIR));
});
afterEach(() => {
  // Test cleanup — never leave uploaded test files behind.
  for (const f of fs.readdirSync(UPLOADS_DIR)) if (!filesBefore.has(f)) fs.unlinkSync(`${UPLOADS_DIR}/${f}`);
});
const newFiles = () => fs.readdirSync(UPLOADS_DIR).filter((f) => !filesBefore.has(f));

describe('upload (HR/Admin)', () => {
  test('admin uploads a PDF payslip for an employee; it is stored privately and audited', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const res = await upload(admin.token, { employeeId: emp.employee._id });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ documentType: 'PAYSLIP', payslipPeriod: PERIOD, status: 'APPROVED', employeeId: emp.employee._id.toString() });
    expect(res.body.data.storedFileName).toBeUndefined();
    expect(newFiles()).toHaveLength(1);
    const audit = await AuditLog.findOne({ action: 'PAYSLIP_UPLOADED' });
    expect(audit.description).toBe('Uploaded September 2026 payslip for asha Test');
    // Not reachable through the public static folder.
    expect((await request(app).get(`/uploads/documents/${newFiles()[0]}`)).status).toBe(404);
  });

  test('an employee cannot upload payslips, either via the payslip route or the general document route', async () => {
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    expect((await upload(emp.token, { employeeId: emp.employee._id })).status).toBe(403);
    const viaDocs = await request(app).post('/api/documents').set(auth(emp.token)).field('documentType', 'PAYSLIP').attach('file', PDF_A, { filename: 'fake.pdf', contentType: 'application/pdf' });
    expect(viaDocs.status).toBe(400);
    expect(await ProfileDocument.countDocuments({})).toBe(0);
    expect(newFiles()).toHaveLength(0);
  });

  test.each([
    ['a non-PDF file', { file: Buffer.from('png'), contentType: 'image/png', filename: 'p.png' }, /PDF/],
    ['a missing month', { period: '' }, /month and year/],
    ['an invalid month', { period: '2026-13' }, /month and year/],
    ['a future month', { period: '2099-01' }, /future month/],
  ])('rejects %s without keeping the file', async (_, opts, message) => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const res = await upload(admin.token, { employeeId: emp.employee._id, ...opts });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(await ProfileDocument.countDocuments({})).toBe(0);
    expect(newFiles()).toHaveLength(0);
  });

  test('rejects an unknown employee', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    expect((await upload(admin.token, { employeeId: 'not-an-id' })).status).toBe(400);
    expect((await upload(admin.token, { employeeId: '64b000000000000000000000' })).status).toBe(400);
    expect(newFiles()).toHaveLength(0);
  });

  test('a second upload for the same employee and month needs an explicit replace', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const emp = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const first = await upload(admin.token, { employeeId: emp.employee._id });
    const dup = await upload(admin.token, { employeeId: emp.employee._id, file: PDF_B });
    expect(dup.status).toBe(409);
    expect(await ProfileDocument.countDocuments({})).toBe(1);
    expect(newFiles()).toHaveLength(1);

    const replaced = await upload(admin.token, { employeeId: emp.employee._id, file: PDF_B, replace: true });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data._id).toBe(first.body.data._id);
    expect(newFiles()).toHaveLength(1); // old file removed, new one kept
    expect((await download(emp.token, first.body.data._id)).body.equals(PDF_B)).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'PAYSLIP_REPLACED' })).toBe(1);
  });

  test('the same month for a different employee is a separate payslip', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const b = await setup(ROLES.EMPLOYEE, 'bala@zorx.test');
    expect((await upload(admin.token, { employeeId: a.employee._id })).status).toBe(201);
    expect((await upload(admin.token, { employeeId: b.employee._id })).status).toBe(201);
  });
});

describe('employee access', () => {
  test('employees list only their own payslips, newest month first', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const b = await setup(ROLES.EMPLOYEE, 'bala@zorx.test');
    await upload(admin.token, { employeeId: a.employee._id, period: '2026-08' });
    await upload(admin.token, { employeeId: a.employee._id, period: '2026-09' });
    await upload(admin.token, { employeeId: b.employee._id, period: '2026-09' });
    const mine = await request(app).get('/api/documents/payslips/me').set(auth(a.token)).query({ employeeId: b.employee._id.toString() });
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((p) => p.payslipPeriod)).toEqual(['2026-09', '2026-08']);
    expect(mine.body.data.every((p) => p.employeeId === a.employee._id.toString() && p.storedFileName === undefined)).toBe(true);
  });

  test('an employee can download their own payslip but not another employee’s', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const b = await setup(ROLES.EMPLOYEE, 'bala@zorx.test');
    const slip = (await upload(admin.token, { employeeId: a.employee._id })).body.data;
    const own = await download(a.token, slip._id);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('application/pdf');
    expect(own.body.equals(PDF_A)).toBe(true);
    expect((await download(b.token, slip._id)).status).toBe(403);
    expect((await request(app).get(`/api/documents/${slip._id}/download`)).status).toBe(401);
    expect((await download(admin.token, slip._id)).status).toBe(200);
  });

  test('employees cannot use the admin payslip list', async () => {
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    expect((await request(app).get('/api/documents/payslips').set(auth(a.token))).status).toBe(403);
  });
});

describe('admin list and filters', () => {
  test('filters by employee, month and year', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const b = await setup(ROLES.EMPLOYEE, 'bala@zorx.test');
    await upload(admin.token, { employeeId: a.employee._id, period: '2025-09' });
    await upload(admin.token, { employeeId: a.employee._id, period: '2026-08' });
    await upload(admin.token, { employeeId: b.employee._id, period: '2026-09' });
    const list = (q) => request(app).get('/api/documents/payslips').set(auth(admin.token)).query(q);
    expect((await list({})).body.data).toHaveLength(3);
    expect((await list({ employeeId: a.employee._id.toString() })).body.data).toHaveLength(2);
    expect((await list({ year: '2026' })).body.data).toHaveLength(2);
    expect((await list({ month: '9' })).body.data).toHaveLength(2);
    const one = (await list({ year: '2026', month: '09' })).body.data;
    expect(one).toHaveLength(1);
    expect(one[0].employeeId).toMatchObject({ firstName: 'bala' });
    expect((await list({ year: '20x6' })).status).toBe(400);
  });
});

describe('existing document features are unaffected', () => {
  test('payslips stay out of profile documents and the approval queue; approve/reject cannot touch them', async () => {
    const admin = await setup(ROLES.ADMIN, 'hr@zorx.test');
    const a = await setup(ROLES.EMPLOYEE, 'asha@zorx.test');
    const slip = (await upload(admin.token, { employeeId: a.employee._id })).body.data;
    const idProof = await request(app).post('/api/documents').set(auth(a.token)).field('documentType', 'ID_PROOF').attach('file', PDF_A, { filename: 'id.pdf', contentType: 'application/pdf' });
    expect(idProof.status).toBe(201);

    const mine = await request(app).get('/api/documents/me').set(auth(a.token));
    expect(mine.body.data.map((d) => d.documentType)).toEqual(['ID_PROOF']);
    const queue = await request(app).get('/api/documents/admin/all').set(auth(admin.token));
    expect(queue.body.data.map((d) => d.documentType)).toEqual(['ID_PROOF']);
    const forEmployee = await request(app).get(`/api/documents/employee/${a.employee._id}`).set(auth(admin.token));
    expect(forEmployee.body.data.map((d) => d.documentType)).toEqual(['ID_PROOF']);

    expect((await request(app).patch(`/api/documents/${slip._id}/reject`).set(auth(admin.token)).send({ reason: 'x' })).status).toBe(404);
    expect((await ProfileDocument.findById(slip._id)).status).toBe('APPROVED');
    expect((await request(app).patch(`/api/documents/${idProof.body.data._id}/approve`).set(auth(admin.token))).status).toBe(200);
  });
});
