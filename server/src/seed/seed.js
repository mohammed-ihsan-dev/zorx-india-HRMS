import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Employee } from '../models/Employee.js';
import { Department } from '../models/Department.js';
import { Attendance } from '../models/Attendance.js';
import { Task } from '../models/Task.js';
import { Leave } from '../models/Leave.js';
import { Announcement } from '../models/Announcement.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { getStartOfDayUTC } from '../utils/dateUtils.js';
import { ROLES, TASK_STATUS, TASK_PRIORITY, LEAVE_TYPE, LEAVE_STATUS } from '../utils/constants.js';

const DEV_PASSWORD = 'Zorx@Dev123';

async function wipe() {
  await Promise.all([
    User.deleteMany({}),
    Employee.deleteMany({}),
    Department.deleteMany({}),
    Attendance.deleteMany({}),
    Task.deleteMany({}),
    Leave.deleteMany({}),
    Announcement.deleteMany({}),
    OfficeSettings.deleteMany({}),
  ]);
}

async function createUserWithEmployee({ email, role, firstName, lastName, designation, departmentId, managerId, employeeCode, joiningDate }) {
  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  const user = await User.create({ email, passwordHash, role });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode,
    firstName,
    lastName,
    designation,
    departmentId,
    managerId,
    joiningDate: joiningDate || new Date('2024-01-15'),
    employmentType: 'FULL_TIME',
    phone: '+91 90000 00000',
    address: 'Kochi, Kerala, India',
    emergencyContact: { name: 'Emergency Contact', phone: '+91 90000 00001', relation: 'Family' },
  });
  user.employeeId = employee._id;
  await user.save();
  return { user, employee };
}

async function run() {
  await connectDB();
  console.log('[seed] wiping existing data...');
  await wipe();

  console.log('[seed] creating office settings...');
  await OfficeSettings.getSingleton();

  console.log('[seed] creating departments...');
  const [dev, hrDept, marketing, sales, finance, operations] = await Department.create([
    { name: 'Development', description: 'Product engineering' },
    { name: 'HR', description: 'Human resources' },
    { name: 'Marketing', description: 'Marketing and growth' },
    { name: 'Sales', description: 'Sales and business development' },
    { name: 'Finance', description: 'Finance and accounts' },
    { name: 'Operations', description: 'Operations' },
  ]);

  console.log('[seed] creating users...');
  const { employee: superAdminEmp } = await createUserWithEmployee({
    email: 'superadmin@zorxindia.dev',
    role: ROLES.SUPER_ADMIN,
    firstName: 'Zorx',
    lastName: 'SuperAdmin',
    designation: 'Super Administrator',
    departmentId: operations._id,
    employeeCode: 'ZX0001',
  });

  const { employee: adminEmp } = await createUserWithEmployee({
    email: 'admin@zorxindia.dev',
    role: ROLES.ADMIN,
    firstName: 'Arjun',
    lastName: 'Nair',
    designation: 'Admin & HR Manager',
    departmentId: hrDept._id,
    employeeCode: 'ZX0002',
  });

  const employeeNames = [
    { firstName: 'Anjali', lastName: 'Krishnan', designation: 'Software Engineer', departmentId: dev._id },
    { firstName: 'Rahul', lastName: 'Varma', designation: 'Software Engineer', departmentId: dev._id },
    { firstName: 'Meera', lastName: 'Suresh', designation: 'Marketing Executive', departmentId: marketing._id },
    { firstName: 'Vishnu', lastName: 'Das', designation: 'Sales Executive', departmentId: sales._id },
    { firstName: 'Priya', lastName: 'Thomas', designation: 'Accountant', departmentId: finance._id },
  ];

  const employees = [];
  for (let i = 0; i < employeeNames.length; i += 1) {
    const info = employeeNames[i];
    const { employee } = await createUserWithEmployee({
      email: `employee${i + 1}@zorxindia.dev`,
      role: ROLES.EMPLOYEE,
      firstName: info.firstName,
      lastName: info.lastName,
      designation: info.designation,
      departmentId: info.departmentId,
      managerId: null,
      employeeCode: `ZX${String(3 + i).padStart(4, '0')}`,
    });
    employees.push(employee);
  }

  console.log('[seed] creating sample attendance for the last 5 working days...');
  const today = new Date();
  for (let dayOffset = 5; dayOffset >= 1; dayOffset -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - dayOffset);
    if (day.getDay() === 0 || day.getDay() === 6) continue; // skip weekends
    const dateKey = getStartOfDayUTC(day);

    for (const employee of employees) {
      const checkInHour = 9 + Math.floor(Math.random() * 1);
      const checkInMinute = 20 + Math.floor(Math.random() * 30);
      const checkIn = new Date(day);
      checkIn.setHours(checkInHour, checkInMinute, 0, 0);

      const checkOut = new Date(checkIn);
      checkOut.setHours(18, Math.floor(Math.random() * 20), 0, 0);

      const totalWorkingMinutes = Math.round((checkOut - checkIn) / 60000 - 60);
      const lateMinutes = checkInMinute > 45 ? checkInMinute - 45 : 0;

      await Attendance.create({
        employeeId: employee._id,
        date: dateKey,
        checkIn: { timestamp: checkIn, latitude: 10.9914, longitude: 76.4428, distanceFromOffice: Math.floor(Math.random() * 150) },
        checkOut: { timestamp: checkOut, latitude: 10.9914, longitude: 76.4428, distanceFromOffice: Math.floor(Math.random() * 150) },
        breakMinutes: 60,
        totalWorkingMinutes,
        overtimeMinutes: 0,
        lateMinutes,
        status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
      });
    }
  }

  console.log('[seed] creating sample tasks...');
  await Task.create([
    {
      title: 'Set up CI pipeline',
      description: 'Configure GitHub Actions for lint, test, and build.',
      assignedTo: employees[0]._id,
      assignedBy: adminEmp.userId,
      priority: TASK_PRIORITY.HIGH,
      status: TASK_STATUS.IN_PROGRESS,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Fix login page responsiveness',
      description: 'Login page breaks on small mobile screens.',
      assignedTo: employees[1]._id,
      assignedBy: adminEmp.userId,
      priority: TASK_PRIORITY.MEDIUM,
      status: TASK_STATUS.TODO,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Prepare Q3 marketing report',
      description: 'Summarize campaign performance for Q3.',
      assignedTo: employees[2]._id,
      assignedBy: adminEmp.userId,
      priority: TASK_PRIORITY.LOW,
      status: TASK_STATUS.COMPLETED,
      completedAt: new Date(),
    },
  ]);

  console.log('[seed] creating sample leave requests...');
  await Leave.create([
    {
      employeeId: employees[0]._id,
      leaveType: LEAVE_TYPE.CASUAL,
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      days: 2,
      reason: 'Family function',
      status: LEAVE_STATUS.PENDING,
    },
    {
      employeeId: employees[3]._id,
      leaveType: LEAVE_TYPE.SICK,
      startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      days: 1,
      reason: 'Fever',
      status: LEAVE_STATUS.APPROVED,
      reviewedBy: adminEmp.userId,
      reviewedAt: new Date(),
    },
  ]);

  console.log('[seed] creating sample announcements...');
  await Announcement.create([
    {
      title: 'Welcome to the new ZORX INDIA Office Management System',
      content: 'We have launched our new office management portal. Please check in and check out daily using the app.',
      priority: 'HIGH',
      audience: 'ALL',
      createdBy: adminEmp.userId,
    },
    {
      title: 'Office timings reminder',
      content: 'Working hours are 09:30 AM to 06:00 PM with a 1 hour break. Please be on time.',
      priority: 'NORMAL',
      audience: 'ALL',
      createdBy: adminEmp.userId,
    },
  ]);

  console.log('\n[seed] Done! Development login credentials (password is the same for all):');
  console.log(`    Password: ${DEV_PASSWORD}\n`);
  console.log('    superadmin@zorxindia.dev  (SUPER_ADMIN) -> SuperAdmin Module');
  console.log('    admin@zorxindia.dev       (ADMIN)       -> Admin / HR Module');
  employees.forEach((_, i) => console.log(`    employee${i + 1}@zorxindia.dev     (EMPLOYEE)    -> User / Employee Module`));

  await disconnectDB();
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
