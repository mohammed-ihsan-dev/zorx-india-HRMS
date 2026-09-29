import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { ROLES, PERMISSIONS } from '../utils/constants.js';

// Idempotent — safe to re-run. Only updates role/permissions on users that
// already exist; never creates, deletes, or touches any other field
// (password, profile, status, etc.) on any account.
const TARGET_ACCESS = [
  { email: 'superadmin@zorxmedia.com', role: ROLES.SUPER_ADMIN, permissions: [] },
  { email: 'ajzal@zorxmedia.com', role: ROLES.SUPER_ADMIN, permissions: [] },
  { email: 'sameel@zorxmedia.com', role: ROLES.SUPER_ADMIN, permissions: [] },

  { email: 'hr@zorxmedia.com', role: ROLES.ADMIN, permissions: [] },

  { email: 'krishnakumar@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [PERMISSIONS.CONTENT_CALENDAR_MANAGE] },
  { email: 'arun@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [PERMISSIONS.CONTENT_CALENDAR_MANAGE] },
  { email: 'shamila@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [PERMISSIONS.CONTENT_CALENDAR_MANAGE] },
  { email: 'neethu@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [PERMISSIONS.CONTENT_CALENDAR_MANAGE] },

  { email: 'mishab@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [] },
  { email: 'shijin@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [] },
  { email: 'nahida@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [] },
  { email: 'ajmal@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [] },
  { email: 'ihsan@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [] },
  { email: 'goutham@zorxmedia.com', role: ROLES.EMPLOYEE, permissions: [] },
];

function sameArray(a, b) {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

async function migrateAccessHierarchy() {
  await connectDB();
  console.log('[migrateAccessHierarchy] Starting access hierarchy migration...');

  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const target of TARGET_ACCESS) {
    const user = await User.findOne({ email: target.email.toLowerCase().trim() });
    if (!user) {
      console.warn(`[migrateAccessHierarchy] NOT FOUND — no user exists for ${target.email}. Skipped (not creating a new account).`);
      missing += 1;
      continue;
    }

    const roleChanged = user.role !== target.role;
    const permissionsChanged = !sameArray(user.permissions || [], target.permissions);

    if (!roleChanged && !permissionsChanged) {
      console.log(`[migrateAccessHierarchy] OK — ${target.email} already ${user.role} / [${(user.permissions || []).join(', ')}]`);
      unchanged += 1;
      continue;
    }

    const before = `${user.role} / [${(user.permissions || []).join(', ')}]`;
    user.role = target.role;
    user.permissions = target.permissions;
    await user.save();
    console.log(`[migrateAccessHierarchy] UPDATED — ${target.email}: ${before} -> ${target.role} / [${target.permissions.join(', ')}]`);
    updated += 1;
  }

  console.log(`[migrateAccessHierarchy] Done. Updated: ${updated}, Unchanged: ${unchanged}, Missing: ${missing}`);
  await disconnectDB();
  process.exit(0);
}

migrateAccessHierarchy().catch((err) => {
  console.error('[migrateAccessHierarchy] Error:', err.message);
  process.exit(1);
});
