import { test } from 'node:test';
import assert from 'node:assert/strict';
import { employeeNavItemsFor, getAdminNavItemsForRole } from './navConfig.js';

const paths = (items) => items.map((i) => i.to);

test('Onsite Work appears only for the server-enabled employee', () => {
  assert.ok(paths(employeeNavItemsFor({ onsiteWorkEligible: true })).includes('/onsite-work'));
  assert.ok(!paths(employeeNavItemsFor({ onsiteWorkEligible: false })).includes('/onsite-work'));
  assert.ok(!paths(employeeNavItemsFor(null)).includes('/onsite-work'));
  assert.ok(paths(employeeNavItemsFor(null)).includes('/work-from-home')); // others unchanged
});

test('admin Onsite Work requests: Super Admins (role permission) and explicit grants only', () => {
  assert.ok(paths(getAdminNavItemsForRole('SUPER_ADMIN', ['CONTENT_CALENDAR_VIEW', 'ONSITE_WORK_REVIEW'])).includes('/admin/onsite-work'));
  assert.ok(!paths(getAdminNavItemsForRole('ADMIN', ['CONTENT_CALENDAR_VIEW'])).includes('/admin/onsite-work'));
  assert.ok(paths(getAdminNavItemsForRole('ADMIN', ['ONSITE_WORK_REVIEW'])).includes('/admin/onsite-work'));
  // Existing super-admin-only items are unchanged.
  assert.ok(!paths(getAdminNavItemsForRole('ADMIN', [])).includes('/admin/audit-logs'));
  assert.ok(paths(getAdminNavItemsForRole('SUPER_ADMIN', [])).includes('/admin/audit-logs'));
});
