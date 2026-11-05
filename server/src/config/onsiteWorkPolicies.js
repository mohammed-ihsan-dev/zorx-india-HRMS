// Employees who may request Onsite Work (attendance outside their assigned
// attendance site on approved dates), by immutable Employee _id — never by name.
// Same pattern as config/wfhPolicies.js. Enforced in onsiteWorkService; adding
// an id here is the only way to enable the feature for someone.
export const ONSITE_WORK_EMPLOYEE_IDS = Object.freeze([
  // MUHAMMED RIFAN (rifan@zorxmedia.com), UAE office — verified 2026-11-05.
  '6adf17303c9ddd5f303eef7a',
]);
