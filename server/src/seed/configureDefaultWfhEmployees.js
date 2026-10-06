import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Employee } from '../models/Employee.js';
import { ROLES, WORK_MODE } from '../utils/constants.js';

// Idempotent — safe to re-run. For each target: an existing account only has
// its Employee.workMode set to WFH (password, profile, role, status and every
// other field are left untouched). A missing account is created the same way
// createEmployee does (hashed password, linked User + Employee).
//
// The password for a NEW account is read from DEFAULT_WFH_INITIAL_PASSWORD so
// it never lives in source control; it is not needed if the account exists.
//   DEFAULT_WFH_INITIAL_PASSWORD='...' node src/seed/configureDefaultWfhEmployees.js
const TARGETS = [{ email: 'aysha@zorxmedia.com', firstName: 'Aysha', lastName: '' }];

async function createAccount(target, password) {
  const user = await User.create({
    email: target.email,
    passwordHash: await User.hashPassword(password),
    role: ROLES.EMPLOYEE,
  });
  const employee = await Employee.create({
    userId: user._id,
    employeeCode: '',
    firstName: target.firstName,
    lastName: target.lastName,
    joiningDate: new Date(),
    workMode: WORK_MODE.WFH,
  });
  user.employeeId = employee._id;
  await user.save();
  return employee;
}

async function configureDefaultWfhEmployees() {
  const password = process.env.DEFAULT_WFH_INITIAL_PASSWORD || '';
  await connectDB();

  for (const target of TARGETS) {
    const email = target.email.toLowerCase().trim();
    const user = await User.findOne({ email });

    if (!user) {
      if (password.length < 8) {
        console.warn(`[configureDefaultWfh] SKIPPED — ${email} does not exist and DEFAULT_WFH_INITIAL_PASSWORD (min 8 chars) was not provided.`);
        continue;
      }
      const employee = await createAccount({ ...target, email }, password);
      console.log(`[configureDefaultWfh] CREATED — ${email} (employee ${employee._id}) as EMPLOYEE with workMode WFH.`);
      continue;
    }

    if (!user.employeeId) {
      console.warn(`[configureDefaultWfh] SKIPPED — ${email} has no linked Employee record; not modifying it.`);
      continue;
    }

    const employee = await Employee.findById(user.employeeId).select('workMode');
    if (!employee) {
      console.warn(`[configureDefaultWfh] SKIPPED — ${email} points to a missing Employee record; not modifying it.`);
      continue;
    }
    if (employee.workMode === WORK_MODE.WFH) {
      console.log(`[configureDefaultWfh] OK — ${email} already has workMode WFH.`);
      continue;
    }
    await Employee.updateOne({ _id: employee._id }, { $set: { workMode: WORK_MODE.WFH } });
    console.log(`[configureDefaultWfh] UPDATED — ${email}: workMode -> WFH (no other fields changed).`);
  }

  await disconnectDB();
  process.exit(0);
}

configureDefaultWfhEmployees().catch((err) => {
  console.error('[configureDefaultWfh] Error:', err.message);
  process.exit(1);
});
