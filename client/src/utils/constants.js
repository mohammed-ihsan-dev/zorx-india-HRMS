// From package.json at build time (vite.config.js), so it always matches the deploy.
/* global __APP_VERSION__, __APP_BUILD__ */
export const APP_VERSION_NUMBER = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.0.0';
export const APP_VERSION = `v${APP_VERSION_NUMBER}`;
export const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
};

export const BACK_OFFICE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
export const MANAGEMENT_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

export const PERMISSIONS = {
  CONTENT_CALENDAR_VIEW: 'CONTENT_CALENDAR_VIEW',
  CONTENT_CALENDAR_MANAGE: 'CONTENT_CALENDAR_MANAGE',
};

export const CONTENT_CALENDAR_STATUS = {
  REMAINING: 'REMAINING',
  ONGOING: 'ONGOING',
  COMPLETED: 'COMPLETED',
};

export const ROLE_LABELS = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMIN: 'Admin / HR',
  EMPLOYEE: 'User / Employee',
};

export const STATUS_COLORS = {
  PRESENT: 'green',
  LATE: 'amber',
  HALF_DAY: 'amber',
  ABSENT: 'red',
  LEAVE: 'blue',
  HOLIDAY: 'slate',
  WEEKEND: 'slate',
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'slate',
  TODO: 'slate',
  IN_PROGRESS: 'blue',
  IN_REVIEW: 'amber',
  COMPLETED: 'green',
  REMAINING: 'slate',
  ONGOING: 'blue',
  ACTIVE: 'green',
  INACTIVE: 'slate',
  SUSPENDED: 'red',
};

export const PRIORITY_COLORS = {
  LOW: 'slate',
  MEDIUM: 'blue',
  HIGH: 'amber',
  URGENT: 'red',
  NORMAL: 'blue',
  CRITICAL: 'red',
};
