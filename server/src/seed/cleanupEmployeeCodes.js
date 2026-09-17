import { connectDB, disconnectDB } from '../config/db.js';
import { Employee } from '../models/Employee.js';
import { isUnassignedCode } from '../controllers/employeeController.js';

async function cleanupEmployeeCodes() {
  await connectDB();
  console.log('[cleanupEmployeeCodes] Checking employees in database...');

  const employees = await Employee.find({});
  let count = 0;

  for (const emp of employees) {
    if (isUnassignedCode(emp.employeeCode) && emp.employeeCode !== '') {
      console.log(`[cleanupEmployeeCodes] Normalizing employeeCode for ${emp.firstName} ${emp.lastName}: "${emp.employeeCode}" -> ""`);
      emp.employeeCode = '';
      await emp.save();
      count++;
    }
  }

  console.log(`[cleanupEmployeeCodes] Normalized ${count} employee records.`);
  await disconnectDB();
  process.exit(0);
}

cleanupEmployeeCodes().catch((err) => {
  console.error('[cleanupEmployeeCodes] Error:', err);
  process.exit(1);
});
