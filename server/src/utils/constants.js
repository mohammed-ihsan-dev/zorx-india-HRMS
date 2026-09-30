export const APP_VERSION = 'v2.0.0';

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
});

export const ROLE_VALUES = Object.values(ROLES);

// Roles that can manage employees, departments, settings, and view org-wide data.
export const BACK_OFFICE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

// Fine-grained capabilities layered on top of a role. A user's effective
// permission set is (role defaults) UNION (this user's explicit `permissions`
// array) — see utils/permissions.js. This is how "Creator" is modeled: an
// EMPLOYEE with an explicit CONTENT_CALENDAR_MANAGE grant, not a new base role.
export const PERMISSIONS = Object.freeze({
  CONTENT_CALENDAR_VIEW: 'CONTENT_CALENDAR_VIEW',
  CONTENT_CALENDAR_MANAGE: 'CONTENT_CALENDAR_MANAGE',
});

export const PERMISSION_VALUES = Object.values(PERMISSIONS);

// Permissions every user of a given role has automatically, before any
// explicit per-user grants are layered on top.
export const ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: [PERMISSIONS.CONTENT_CALENDAR_VIEW, PERMISSIONS.CONTENT_CALENDAR_MANAGE],
  [ROLES.ADMIN]: [PERMISSIONS.CONTENT_CALENDAR_VIEW],
  [ROLES.EMPLOYEE]: [PERMISSIONS.CONTENT_CALENDAR_VIEW],
});

export const CONTENT_CALENDAR_STATUS = Object.freeze({
  REMAINING: 'REMAINING',
  ONGOING: 'ONGOING',
  COMPLETED: 'COMPLETED',
});

export const USER_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
});

export const EMPLOYMENT_TYPE = Object.freeze({
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  INTERN: 'INTERN',
});

export const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  HALF_DAY: 'HALF_DAY',
  ABSENT: 'ABSENT',
  LEAVE: 'LEAVE',
  HOLIDAY: 'HOLIDAY',
  WEEKEND: 'WEEKEND',
});

export const BREAK_TYPE = Object.freeze({
  TEA: 'TEA',
  WASHROOM: 'WASHROOM',
  LUNCH: 'LUNCH',
  PERSONAL: 'PERSONAL',
  OTHER: 'OTHER',
});

export const LEAVE_TYPE = Object.freeze({
  CASUAL: 'CASUAL',
  SICK: 'SICK',
  EARNED: 'EARNED',
  UNPAID: 'UNPAID',
});

export const LEAVE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

export const TASK_STATUS = Object.freeze({
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

export const TASK_PRIORITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
});

export const ANNOUNCEMENT_PRIORITY = Object.freeze({
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

export const ANNOUNCEMENT_AUDIENCE = Object.freeze({
  ALL: 'ALL',
  MANAGERS: 'MANAGERS',
  DEPARTMENT: 'DEPARTMENT',
});

export const NOTIFICATION_TYPE = Object.freeze({
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  CONTENT_CALENDAR_ASSIGNED: 'CONTENT_CALENDAR_ASSIGNED',
  LEAVE_SUBMITTED: 'LEAVE_SUBMITTED',
  LEAVE_APPROVED: 'LEAVE_APPROVED',
  LEAVE_REJECTED: 'LEAVE_REJECTED',
  ANNOUNCEMENT_PUBLISHED: 'ANNOUNCEMENT_PUBLISHED',
  ATTENDANCE_WARNING: 'ATTENDANCE_WARNING',
  TASK_DEADLINE_APPROACHING: 'TASK_DEADLINE_APPROACHING',
  SIGNUP_SUBMITTED: 'SIGNUP_SUBMITTED',
  ACCOUNT_APPROVED: 'ACCOUNT_APPROVED',
  ACCOUNT_REJECTED: 'ACCOUNT_REJECTED',
  EDIT_REQUEST_SUBMITTED: 'EDIT_REQUEST_SUBMITTED',
  EDIT_REQUEST_APPROVED: 'EDIT_REQUEST_APPROVED',
  EDIT_REQUEST_REJECTED: 'EDIT_REQUEST_REJECTED',
});

// Profile fields an employee may request HR to change. Only PHONE, ADDRESS, and
// DATE_OF_BIRTH map to a single unambiguous schema path and are auto-applied on
// approval; EMERGENCY_CONTACT/NAME/OTHER require HR to apply the change manually
// via the existing employee edit form after approving the request.
export const EDIT_REQUEST_FIELD = Object.freeze({
  PHONE: 'PHONE',
  ADDRESS: 'ADDRESS',
  EMERGENCY_CONTACT: 'EMERGENCY_CONTACT',
  DATE_OF_BIRTH: 'DATE_OF_BIRTH',
  NAME: 'NAME',
  OTHER: 'OTHER',
});

export const EDIT_REQUEST_AUTO_APPLY_PATH = Object.freeze({
  PHONE: 'phone',
  ADDRESS: 'address',
  DATE_OF_BIRTH: 'dateOfBirth',
});

export const EDIT_REQUEST_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

export const DOCUMENT_TYPE = Object.freeze({
  PROFILE_PHOTO: 'PROFILE_PHOTO',
  ID_PROOF: 'ID_PROOF',
  ADDRESS_PROOF: 'ADDRESS_PROOF',
  EDUCATIONAL_CERTIFICATE: 'EDUCATIONAL_CERTIFICATE',
  MEDICAL_PROOF: 'MEDICAL_PROOF',
  OTHER: 'OTHER',
});
