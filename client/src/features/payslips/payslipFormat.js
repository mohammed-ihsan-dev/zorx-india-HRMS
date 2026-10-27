const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-09' → 'September 2026' (invalid input is returned unchanged). */
export function payslipPeriodLabel(period) {
  const match = /^(\d{4})-(\d{2})$/.exec(period || '');
  const month = match && MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : period || '';
}

/** Download name for a payslip: 'Payslip-2026-09.pdf'. */
export function payslipFileName(period) {
  return `Payslip-${/^\d{4}-\d{2}$/.test(period || '') ? period : 'document'}.pdf`;
}

/** Latest selectable payslip month (the current month in India), as 'YYYY-MM'. */
export function currentPayslipPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}

export { MONTHS as PAYSLIP_MONTHS };
