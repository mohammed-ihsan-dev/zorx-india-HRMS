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
    email: 'ihsan@spadmin.com',
    role: ROLES.SUPER_ADMIN,
    firstName: 'Ihsan',
    lastName: 'SuperAdmin',
    designation: 'Super Administrator',
    departmentId: operations._id,
    employeeCode: 'ZX0001',
  });

  // Also create legacy alias
  await createUserWithEmployee({
    email: 'superadmin@zorxindia.dev',
    role: ROLES.SUPER_ADMIN,
    firstName: 'Zorx',
    lastName: 'SuperAdmin',
    designation: 'Super Administrator',
    departmentId: operations._id,
    employeeCode: 'ZX0000',
  });

  const { employee: adminEmp } = await createUserWithEmployee({
    email: 'ihsan@admin.com',
    role: ROLES.ADMIN,
    firstName: 'Ihsan',
    lastName: 'Admin',
    designation: 'Admin & HR Manager',
    departmentId: hrDept._id,
    employeeCode: 'ZX0002',
  });

  // Also create legacy alias
  await createUserWithEmployee({
    email: 'admin@zorxindia.dev',
    role: ROLES.ADMIN,
    firstName: 'Arjun',
    lastName: 'Nair',
    designation: 'Admin & HR Manager',
    departmentId: hrDept._id,
    employeeCode: 'ZX0000B',
  });

  const { employee: userEmp } = await createUserWithEmployee({
    email: 'ihsan@user.com',
    role: ROLES.EMPLOYEE,
    firstName: 'Ihsan',
    lastName: 'User',
    designation: 'Software Engineer',
    departmentId: dev._id,
    managerId: adminEmp._id,
    employeeCode: 'ZX0003',
  });

  const employeeNames = [
    { firstName: 'Anjali', lastName: 'Krishnan', designation: 'Software Engineer', departmentId: dev._id },
    { firstName: 'Rahul', lastName: 'Varma', designation: 'Software Engineer', departmentId: dev._id },
    { firstName: 'Meera', lastName: 'Suresh', designation: 'Marketing Executive', departmentId: marketing._id },
    { firstName: 'Vishnu', lastName: 'Das', designation: 'Sales Executive', departmentId: sales._id },
    { firstName: 'Priya', lastName: 'Thomas', designation: 'Accountant', departmentId: finance._id },
  ];

  const employees = [userEmp];
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
      employeeCode: `ZX${String(4 + i).padStart(4, '0')}`,
    });
    employees.push(employee);
  }

  console.log('\n[seed] Done! Development login credentials (password is the same for all):');
  console.log(`    Password: ${DEV_PASSWORD}\n`);
  console.log('    ihsan@spadmin.com (SUPER_ADMIN) -> SuperAdmin Module');
  console.log('    ihsan@admin.com   (ADMIN)       -> Admin / HR Module');
  console.log('    ihsan@user.com    (EMPLOYEE)    -> User / Employee Module\n');

  await disconnectDB();
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
