// Per-employee leave exceptions, by immutable Employee _id (never by name) —
// same pattern as config/wfhPolicies.js and config/onsiteWorkPolicies.js.
// They only move an employee's accrual start; the leave policy itself is unchanged.
export const CASUAL_CREDIT_START_OVERRIDES = Object.freeze({
  // MUHAMMED RIFAN (rifan@zorxmedia.com): started using the HRMS on 28 Oct 2026
  // and took no Casual Leave in October; HR confirmed his October day does not
  // carry forward, so his Casual credits start in November 2026 (approved 2026-11-06).
  '6adf17303c9ddd5f303eef7a': { year: 2026, monthIndex: 10 },
});
