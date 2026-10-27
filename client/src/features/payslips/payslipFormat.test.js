import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payslipPeriodLabel, payslipFileName, currentPayslipPeriod } from './payslipFormat.js';

test('period labels', () => {
  assert.equal(payslipPeriodLabel('2026-09'), 'September 2026');
  assert.equal(payslipPeriodLabel('2027-01'), 'January 2027');
  assert.equal(payslipPeriodLabel('2026-13'), '2026-13');
  assert.equal(payslipPeriodLabel(null), '');
});

test('download file names never use untrusted text', () => {
  assert.equal(payslipFileName('2026-09'), 'Payslip-2026-09.pdf');
  assert.equal(payslipFileName('../../etc'), 'Payslip-document.pdf');
});

test('current period follows India time', () => {
  // 31 Oct 2026 20:00 UTC is already 1 Nov in India.
  assert.equal(currentPayslipPeriod(new Date('2026-10-31T20:00:00Z')), '2026-11');
  assert.equal(currentPayslipPeriod(new Date('2026-10-31T10:00:00Z')), '2026-10');
});
