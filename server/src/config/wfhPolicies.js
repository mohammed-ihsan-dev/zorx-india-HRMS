// Recurring work-from-home exceptions, by immutable Employee _id (never by
// name). Each grants WFH on matching dates only, enforced in
// wfhService.resolveWfhSource — the single check-in/out WFH decision. They set
// eligibility only: attendance still comes from the normal check-in/check-out.
export const RECURRING_WFH_RULE = Object.freeze({ SECOND_SATURDAY: 'SECOND_SATURDAY' });

export const RECURRING_WFH_POLICIES = Object.freeze([
  {
    // Shijin P (shijin@zorxmedia.com), verified 2026-10-29.
    employeeId: '6aabba950573c80dc46eb6bc',
    rule: RECURRING_WFH_RULE.SECOND_SATURDAY,
    workingStartTime: '09:30',
    workingEndTime: '18:00',
  },
]);
