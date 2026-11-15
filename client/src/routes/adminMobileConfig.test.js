import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAdminNavItemsForRole } from './navConfig.js';
import { adminBottomNavFor, adminMenuGroupsFor, adminMobileDestinationsFor, adminMenuChildrenFor } from './adminMobileConfig.js';
import { ROLES, PERMISSIONS } from '../utils/constants.js';

const HR = { role: ROLES.ADMIN, permissions: [] };
const SA = { role: ROLES.SUPER_ADMIN, permissions: [PERMISSIONS.ONSITE_WORK_REVIEW] };
const reachable = (user) => new Set([...adminBottomNavFor(user), ...adminMenuGroupsFor(user).flatMap((g) => g.items)].map((i) => i.to));

for (const [name, user] of [['HR', HR], ['Super Admin', SA]]) {
  test(`${name}: every desktop sidebar module is reachable on the phone`, () => {
    const r = reachable(user);
    for (const item of getAdminNavItemsForRole(user.role, user.permissions)) {
      assert.ok(r.has(item.to), `${item.to} missing from the ${name} phone UI`);
    }
  });

  test(`${name}: bottom nav has 5 items with Home in the middle`, () => {
    const nav = adminBottomNavFor(user);
    assert.equal(nav.length, 5);
    assert.equal(nav[2].to, '/admin');
    assert.equal(nav[4].to, '/admin/menu');
  });

  test(`${name}: no destination appears twice`, () => {
    const all = [...adminBottomNavFor(user), ...adminMenuGroupsFor(user).flatMap((g) => g.items)].map((i) => i.to);
    assert.equal(new Set(all).size, all.length);
  });
}

test('HR never sees Super Admin-only modules', () => {
  const r = reachable(HR);
  for (const p of ['/admin/audit-logs', '/admin/settings/office', '/admin/approvals', '/admin/overview', '/admin/edit-requests']) assert.ok(!r.has(p), p);
});

test('Onsite Work review only with the permission', () => {
  assert.ok(!reachable({ role: ROLES.SUPER_ADMIN, permissions: [] }).has('/admin/onsite-work'));
  assert.ok(reachable(SA).has('/admin/onsite-work'));
});

test('HR has personal attendance and leave; Super Admin does not', () => {
  const hr = reachable(HR);
  assert.ok(hr.has('/attendance') && hr.has('/leave'));
  const sa = reachable(SA);
  for (const p of ['/attendance', '/leave', '/work-from-home', '/onsite-work', '/tasks', '/payslips']) assert.ok(!sa.has(p), p);
});

test('HR self-service Onsite Work only where the server enabled it', () => {
  assert.ok(!reachable(HR).has('/onsite-work'));
  assert.ok(reachable({ ...HR, onsiteWorkEligible: true }).has('/onsite-work'));
});

test('Super Admin approvals group holds the existing approval workflows', () => {
  const approvals = adminMenuGroupsFor(SA).find((g) => g.title === 'Approvals');
  assert.deepEqual(approvals.items.map((i) => i.to), ['/admin/leaves', '/admin/work-from-home', '/admin/onsite-work', '/admin/edit-requests']);
});

test('Menu tab stays highlighted on menu pages, not on bottom-nav pages', () => {
  const kids = adminMenuChildrenFor(HR);
  assert.ok(kids.includes('/admin/reports') && kids.includes('/leave'));
  assert.ok(!kids.includes('/admin/employees') && !kids.includes('/admin'));
  assert.ok(adminMobileDestinationsFor(SA).every((i) => i.to !== '/leave'));
});
