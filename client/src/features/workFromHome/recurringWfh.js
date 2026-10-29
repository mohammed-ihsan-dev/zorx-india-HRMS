// Calendar display of a recurring WFH policy. The server decides eligibility at
// check-in/out (wfhService.resolveWfhSource) and only tells the client the rule
// name (/work-from-home/my/today → recurringRule); this just marks the dates.

/** Second Saturday of its month, for a "YYYY-MM-DD" key. */
export function isSecondSaturdayKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return false;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6 && d >= 8 && d <= 14;
}

const RULES = { SECOND_SATURDAY: isSecondSaturdayKey };

/** True when `key` is a policy WFH date for this rule. */
export const isRecurringWfhDay = (rule, key) => Boolean(rule && RULES[rule]?.(key));
