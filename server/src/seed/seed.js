import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Employee } from '../models/Employee.js';
import { Department } from '../models/Department.js';
import { Attendance } from '../models/Attendance.js';
import { Task } from '../models/Task.js';
import { Leave } from '../models/Leave.js';
import { Announcement } from '../models/Announcement.js';
import { OfficeSettings } from '../models/OfficeSettings.js';
import { generateEmployeeCode } from '../controllers/employeeController.js';
import { ROLES, USER_STATUS } from '../utils/constants.js';

const DEV_PASSWORD = 'Password';

async function createUserWithEmployee({ email, role, firstName, lastName, designation, departmentId, managerId, employeeCode, joiningDate }) {
  const normalizedEmail = email.toLowerCase().trim();
  let user = await User.findOne({ email: normalizedEmail });
  if (user) {
    console.log(`[seed] Skipping existing admin account: ${normalizedEmail}`);
    return { user, employee: null };
  }

  const passwordHash = await User.hashPassword(DEV_PASSWORD);
  user = await User.create({ email: normalizedEmail, passwordHash, role, status: USER_STATUS.ACTIVE });
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
  });
  user.employeeId = employee._id;
  await user.save();
  return { user, employee };
}

async function seedInitialEmployeeAccounts(departments) {
  const INITIAL_EMPLOYEES = [
    {
      name: 'Shamila Sherin K.P',
      email: 'shamila@zorxmedia.com',
      designation: 'SEO Specialist',
      joiningDate: new Date('2026-09-07'),
      departmentName: 'Marketing',
      profileImage: '/profile/shamila.png',
    },
    {
      name: 'Mishab P',
      email: 'mishab@zorxmedia.com',
      designation: 'Graphic Designer',
      joiningDate: new Date('2026-09-01'),
      departmentName: 'Marketing',
      profileImage: '/profile/mishab.jpeg',
    },
    {
      name: 'Shijin P',
      email: 'shijin@zorxmedia.com',
      designation: 'Web Developer',
      joiningDate: new Date('2026-09-12'),
      departmentName: 'Development',
      profileImage: '/profile/shijin.jpeg',
    },
    {
      name: 'Neethu N',
      email: 'neethu@zorxmedia.com',
      designation: 'DIGITAL MARKETER',
      joiningDate: new Date('2026-09-01'),
      departmentName: 'Marketing',
      profileImage: '/profile/neethu.jpeg',
    },
    {
      name: 'Nahida Sherin K',
      email: 'nahida@zorxmedia.com',
      designation: 'Office Administration & SOP Specialist',
      joiningDate: new Date('2026-09-01'),
      departmentName: 'Operations',
      profileImage: '/profile/nahida.jpeg',
    },
    {
      name: 'Mohammed Ajmal M',
      email: 'ajmal@zorxmedia.com',
      designation: 'Senior Graphic Designer',
      joiningDate: new Date('2026-09-11'),
      departmentName: 'Marketing',
      profileImage: '/profile/ajmal.jpeg',
    },
    {
      name: 'Mohammed Ihsan',
      email: 'ihsan@zorxmedia.com',
      designation: 'Web Developer',
      joiningDate: new Date('2026-10-12'),
      departmentName: 'Development',
      profileImage: '/profile/ihsan.jpeg',
    },
    {
      name: 'Goutham Krishna',
      email: 'goutham@zorxmedia.com',
      designation: 'Video Editor',
      joiningDate: new Date('2026-09-15'),
      departmentName: 'Marketing',
      profileImage: '/profile/goutham.png',
    },
  ];

  const tempHash = await User.hashPassword('1234');
  const deptMap = new Map(departments.map((d) => [d.name, d._id]));

  for (const item of INITIAL_EMPLOYEES) {
    const normalizedEmail = item.email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      console.log(`[seed] Account already exists: ${normalizedEmail}. Skipping.`);
      continue;
    }

    const clean = item.name.trim();
    const parts = clean.split(/\s+/);
    let firstName = '';
    let lastName = '';
    if (parts.length === 1) {
      if (clean.includes('.')) {
        const dotIdx = clean.lastIndexOf('.');
        firstName = clean.substring(0, dotIdx) || clean;
        lastName = clean.substring(dotIdx + 1) || '.';
      } else {
        firstName = clean;
        lastName = '.';
      }
    } else {
      lastName = parts.pop() || '.';
      firstName = parts.join(' ');
    }

    const user = await User.create({
      email: normalizedEmail,
      passwordHash: tempHash,
      role: ROLES.EMPLOYEE,
      status: USER_STATUS.ACTIVE,
      mustChangePassword: true,
    });

    const employee = await Employee.create({
      userId: user._id,
      employeeCode: '',
      firstName,
      lastName,
      designation: item.designation,
      joiningDate: item.joiningDate,
      departmentId: deptMap.get(item.departmentName) || null,
      employmentType: 'FULL_TIME',
      profileImage: item.profileImage,
    });

    user.employeeId = employee._id;
    await user.save();
    console.log(`[seed] Created initial employee account: ${item.name} (${normalizedEmail})`);
  }
}

async function run() {
  await connectDB();

  console.log('[seed] checking/creating office settings...');
  await OfficeSettings.getSingleton();

  console.log('[seed] checking/creating default departments...');
  const deptNames = ['Development', 'HR', 'Marketing', 'Sales', 'Finance', 'Operations'];
  const departments = [];
  for (const name of deptNames) {
    let d = await Department.findOne({ name });
    if (!d) {
      d = await Department.create({ name, description: `${name} department` });
    }
    departments.push(d);
  }

  const deptMap = new Map(departments.map((d) => [d.name, d._id]));

  console.log('[seed] checking/creating admin users...');
  const ADMIN_ACCOUNTS = [
    { email: 'superadmin@zorxmedia.com', role: ROLES.SUPER_ADMIN, firstName: 'Super', lastName: 'Admin', designation: 'Super Administrator', department: 'Operations' },
    { email: 'ajzal@zorxmedia.com', role: ROLES.SUPER_ADMIN, firstName: 'Ajzal', lastName: '.', designation: 'Super Administrator', department: 'Operations' },
    { email: 'sameel@zorxmedia.com', role: ROLES.SUPER_ADMIN, firstName: 'Sameel', lastName: '.', designation: 'Super Administrator', department: 'Operations' },
    { email: 'hr@zorxmedia.com', role: ROLES.ADMIN, firstName: 'HR', lastName: 'Manager', designation: 'HR Manager', department: 'HR' },
    { email: 'krishnakumar@zorxmedia.com', role: ROLES.ADMIN, firstName: 'Krishna', lastName: 'Kumar', designation: 'Administrator', department: 'Operations' },
    { email: 'arun@zorxmedia.com', role: ROLES.ADMIN, firstName: 'Arun', lastName: '.', designation: 'Administrator', department: 'Operations' },
  ];

  for (const adm of ADMIN_ACCOUNTS) {
    await createUserWithEmployee({
      email: adm.email,
      role: adm.role,
      firstName: adm.firstName,
      lastName: adm.lastName,
      designation: adm.designation,
      departmentId: deptMap.get(adm.department),
    });
  }

  console.log('[seed] checking/creating initial employee accounts...');
  await seedInitialEmployeeAccounts(departments);

  console.log('\n[seed] Complete! Initial accounts ready.');

  await disconnectDB();
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
