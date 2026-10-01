import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';
import { ROLES, USER_STATUS, LEAVE_TYPE } from './constants.js';

/**
 * Non-persisted virtual test identity. Everything in this module lives only
 * in this server process's memory — nothing here is ever written to
 * MongoDB. See server/src/middleware/auth.js (login/requireAuth) for how
 * this plugs into the real authentication flow, and attendanceController.js
 * / leaveController.js / employeeController.js for the per-module
 * simulate-instead-of-persist branches that check `req.user.isVirtualTestUser`.
 *
 * Reserved, never-persisted sentinel ObjectIds — valid ObjectId shape so any
 * existing Mongoose query that filters by employeeId/userId stays type-safe
 * (no CastError) even if it's reached from a code path this feature didn't
 * explicitly audit; such a query simply matches zero real documents, since
 * nothing ever writes a real document under these IDs.
 */
export const VIRTUAL_USER_ID = new mongoose.Types.ObjectId('111111111111111111111111');
export const VIRTUAL_EMPLOYEE_ID = new mongoose.Types.ObjectId('222222222222222222222222');

/**
 * Explicit double gate: TEST_USER_ENABLED must be true, and in production an
 * additional ALLOW_VIRTUAL_TEST_USER flag is also required. Re-checked on
 * every request (not just at login), so flipping TEST_USER_ENABLED off
 * immediately invalidates any already-issued virtual session token too.
 */
export function isVirtualTestUserEnabled() {
  if (!env.testUser.enabled) return false;
  if (env.nodeEnv === 'production' && !env.testUser.allowInProduction) return false;
  return true;
}

export function matchesVirtualTestCredentials(email, password) {
  if (!isVirtualTestUserEnabled()) return false;
  if (!env.testUser.email || !env.testUser.password) return false;
  const normalizedEmail = (email || '').trim().toLowerCase();
  return normalizedEmail === env.testUser.email.toLowerCase() && password === env.testUser.password;
}

function buildVirtualEmployee() {
  return {
    _id: VIRTUAL_EMPLOYEE_ID,
    firstName: 'Test',
    lastName: 'User',
    employeeCode: 'TEST-VIRTUAL',
    profileImage: '',
    avatarUrl: '',
    phone: '',
    departmentId: null,
    designation: 'Virtual Test Account',
    joiningDate: new Date(),
    dateOfBirth: null,
    employmentType: 'FULL_TIME',
    managerId: null,
    address: '',
    emergencyContact: { name: '', phone: '', relation: '' },
    status: 'ACTIVE',
  };
}

/** The in-memory User+Employee shape placed on req.user — never a Mongoose document. */
export function buildVirtualUser() {
  return {
    _id: VIRTUAL_USER_ID,
    email: env.testUser.email,
    role: ROLES.EMPLOYEE,
    status: USER_STATUS.ACTIVE,
    employeeId: buildVirtualEmployee(),
    mustChangePassword: false,
    permissions: [],
    lastLogin: new Date(),
    isVirtualTestUser: true,
  };
}

// ---- In-memory, process-local attendance snapshot (never persisted) ----
// A single shared slot is sufficient: this is one reserved shared test
// credential, not a per-user record, and resetting on server restart is
// expected/acceptable for throwaway test data.
let snapshotState = { dateKey: null, snapshot: null };

function todayKeyString() {
  // Calendar-day granularity in the configured office timezone, just to know
  // when to reset the in-memory snapshot for a new day — not used for any
  // persisted record, so a simple locale-date string is sufficient here.
  return new Date().toLocaleDateString('en-CA', { timeZone: env.timezone });
}

export function getVirtualAttendanceSnapshot() {
  const key = todayKeyString();
  if (snapshotState.dateKey !== key) {
    snapshotState = { dateKey: key, snapshot: null };
  }
  return snapshotState.snapshot;
}

export function setVirtualAttendanceSnapshot(snapshot) {
  snapshotState = { dateKey: todayKeyString(), snapshot };
  return snapshot;
}

export function resetVirtualAttendanceSnapshot() {
  snapshotState = { dateKey: null, snapshot: null };
}

/**
 * For write endpoints that have no designed virtual-simulation behavior
 * (e.g. profile edit requests, document uploads) — the safest default is to
 * block rather than silently create a real document under the virtual IDs.
 * Apply only to the specific create/mutate routes that need it; routes
 * already gated by role/permission (Content Calendar manage, task
 * assignment, admin actions) never reach the virtual EMPLOYEE role anyway.
 */
export function blockVirtualUserWrite(req, res, next) {
  if (req.user?.isVirtualTestUser) {
    return next(ApiError.badRequest('This action is not available for the virtual test account.'));
  }
  next();
}

// ---- Leave balance simulation (never persisted) ----
// Mirrors leaveService.js's DEFAULT_BALANCES shape for display purposes only;
// the virtual user's leave actions never touch the real LeaveBalance collection.
export function getVirtualLeaveBalance() {
  return {
    balances: { [LEAVE_TYPE.CASUAL]: 0, [LEAVE_TYPE.SICK]: 1, [LEAVE_TYPE.EARNED]: 1 },
    used: { [LEAVE_TYPE.CASUAL]: 0, [LEAVE_TYPE.SICK]: 0, [LEAVE_TYPE.EARNED]: 0 },
  };
}
