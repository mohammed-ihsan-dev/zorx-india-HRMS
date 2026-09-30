import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Employee } from '../src/models/Employee.js';
import { Client } from '../src/models/Client.js';
import { ContentCalendarItem } from '../src/models/ContentCalendarItem.js';
import { ROLES, CONTENT_CALENDAR_STATUS, TASK_PRIORITY } from '../src/utils/constants.js';

const app = createApp();
const DEV_PASSWORD = 'Test@12345';

async function createUser(role, email, firstName = 'Test', lastName = 'User') {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: `E-${Math.random().toString(36).slice(2, 7)}`,
    firstName,
    lastName,
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

describe('Admin Dashboard Analytics API', () => {
  test('calculates accurate summary metrics and aggregations from real database records', async () => {
    const { user: admin, employee: adminEmp } = await createUser(ROLES.ADMIN, 'admin-dash@zorx.test', 'Admin', 'User');
    const { employee: worker } = await createUser(ROLES.EMPLOYEE, 'worker-dash@zorx.test', 'Krishna', 'Kumar');
    const client = await Client.create({ name: 'PressD' });
    const token = await login(admin.email);

    const now = new Date();
    const pastDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    // Create controlled 10 ContentCalendar records:
    // 6 Completed
    for (let i = 0; i < 6; i++) {
      await ContentCalendarItem.create({
        clientId: client._id,
        client: 'PressD',
        date: now,
        assignedEmployee: worker._id,
        assignedBy: admin._id,
        work: `Completed Task ${i + 1}`,
        deadline: futureDate,
        priority: TASK_PRIORITY.HIGH,
        workStatus: CONTENT_CALENDAR_STATUS.COMPLETED,
      });
    }

    // 2 Ongoing
    for (let i = 0; i < 2; i++) {
      await ContentCalendarItem.create({
        clientId: client._id,
        client: 'PressD',
        date: now,
        assignedEmployee: worker._id,
        assignedBy: admin._id,
        work: `Ongoing Task ${i + 1}`,
        deadline: futureDate,
        priority: TASK_PRIORITY.MEDIUM,
        workStatus: CONTENT_CALENDAR_STATUS.ONGOING,
      });
    }

    // 2 Remaining (1 with past deadline -> overdue, 1 with future deadline)
    await ContentCalendarItem.create({
      clientId: client._id,
      client: 'PressD',
      date: now,
      assignedEmployee: worker._id,
      assignedBy: admin._id,
      work: 'Overdue Remaining Task',
      deadline: pastDate,
      priority: TASK_PRIORITY.URGENT,
      workStatus: CONTENT_CALENDAR_STATUS.REMAINING,
    });

    await ContentCalendarItem.create({
      clientId: client._id,
      client: 'PressD',
      date: now,
      assignedEmployee: worker._id,
      assignedBy: admin._id,
      work: 'Future Remaining Task',
      deadline: futureDate,
      priority: TASK_PRIORITY.LOW,
      workStatus: CONTENT_CALENDAR_STATUS.REMAINING,
    });

    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    // Verify summary metrics
    expect(data.summary.totalWork).toBe(10);
    expect(data.summary.completed).toBe(6);
    expect(data.summary.ongoing).toBe(2);
    expect(data.summary.remaining).toBe(2);
    expect(data.summary.completionRate).toBe(60);
    expect(data.summary.overdue).toBe(1);

    // Verify status distribution
    const completedDist = data.statusDistribution.find((s) => s.name === 'Completed');
    expect(completedDist.value).toBe(6);

    // Verify employee workload aggregation
    expect(data.employeeWorkload.length).toBeGreaterThan(0);
    const krishWork = data.employeeWorkload.find((e) => e.employeeName.includes('Krishna'));
    expect(krishWork).toBeDefined();
    expect(krishWork.total).toBe(10);
    expect(krishWork.completed).toBe(6);

    // Verify client workload aggregation
    expect(data.clientWorkload.length).toBeGreaterThan(0);
    const clientWork = data.clientWorkload.find((c) => c.clientName === 'PressD');
    expect(clientWork).toBeDefined();
    expect(clientWork.total).toBe(10);

    // Verify priority distribution
    const urgentCount = data.priorityDistribution.find((p) => p.priority === 'URGENT');
    expect(urgentCount.count).toBe(1);

    // Verify overdue items list
    expect(data.overdueWorkList.length).toBe(1);
    expect(data.overdueWorkList[0].work).toBe('Overdue Remaining Task');
  });

  test('restricts dashboard analytics access to ADMIN/SUPER_ADMIN and denies EMPLOYEE', async () => {
    const { user: emp } = await createUser(ROLES.EMPLOYEE, 'regular-emp@zorx.test');
    const token = await login(emp.email);

    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
