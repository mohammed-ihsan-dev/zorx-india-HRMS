import {
  CalendarDays,
  Users,
  House,
  Megaphone,
  Menu,
  BarChart3,
  ClipboardCheck,
  CalendarCheck,
  CalendarClock,
  ListChecks,
  Bell,
  Settings,
  User,
  ReceiptText,
  MapPin,
  FilePenLine,
} from 'lucide-react';
import { ROLES } from '../utils/constants.js';
import { getAdminNavItemsForRole, employeeNavItemsFor } from './navConfig.js';

/**
 * Phone shells for the two back-office roles (AdminLayout below 768px).
 * Built FROM the desktop sidebar config (getAdminNavItemsForRole), so every module a
 * role can open on desktop is reachable on the phone — anything not placed in a group
 * below lands in "More" — and nothing a role cannot open is ever listed.
 * Server permissions stay the authority; this only decides what is shown.
 */

export const ADMIN_MENU_PATH = '/admin/menu';

const HR_BOTTOM_NAV = [
  { to: '/attendance', label: 'My Attendance', icon: CalendarDays },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin', label: 'Home', icon: House, end: true },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: ADMIN_MENU_PATH, label: 'Menu', icon: Menu },
];

const SUPER_ADMIN_BOTTOM_NAV = [
  { to: '/admin/overview', label: 'Overview', icon: BarChart3 },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin', label: 'Home', icon: House, end: true },
  { to: '/admin/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: ADMIN_MENU_PATH, label: 'Menu', icon: Menu },
];

// Personal (own-record) pages. HR is an employee for attendance & leave; a Super Admin
// does not personally check in, so gets none of the attendance/leave self-service pages.
const HR_PERSONAL = [
  { to: '/leave', label: 'My Leave', detail: 'Request leave · history · balance', icon: CalendarClock },
  { to: '/work-from-home', label: 'My Work From Home', icon: House },
  { to: '/onsite-work', label: 'My Onsite Work', icon: MapPin, onsiteOnly: true },
  { to: '/tasks', label: 'My Tasks', icon: ListChecks },
  { to: '/payslips', label: 'My Payslips', icon: ReceiptText },
];
const COMMON_PERSONAL = [
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];
// Existing pages with no sidebar entry on desktop.
const SUPER_ADMIN_EXTRA = [
  { to: '/admin/edit-requests', label: 'Profile Edit Requests', icon: FilePenLine },
  { to: '/admin/approvals', label: 'Pending Approvals', icon: ClipboardCheck },
  { to: '/admin/overview', label: 'Analytics Overview', icon: BarChart3 },
];

const LABELS = {
  '/admin/attendance': 'Attendance Records',
  '/admin/leaves': 'Leave Requests',
  '/admin/work-from-home': 'Work From Home Requests',
  '/admin/onsite-work': 'Onsite Work Requests',
  '/admin/tasks': 'Task Management',
  '/admin/announcements': 'Announcements',
  '/admin/settings/office': 'Office Settings',
};

const HR_GROUPS = [
  { title: 'Work', paths: ['/admin/attendance', '/admin/tasks', '/admin/content-calendar', '/admin/work-from-home', '/admin/onsite-work'] },
  { title: 'Leave', paths: ['/leave', '/admin/leaves'] },
  { title: 'Management', paths: ['/admin/payslips', '/admin/holidays', '/admin/departments', '/admin/reports'] },
  { title: 'My Work', paths: ['/tasks', '/work-from-home', '/onsite-work', '/payslips'] },
  { title: 'Updates', paths: ['/notifications'] },
  { title: 'Account', paths: ['/settings'] },
];

const SUPER_ADMIN_GROUPS = [
  { title: 'Management', paths: ['/admin/attendance', '/admin/tasks', '/admin/content-calendar', '/admin/departments', '/admin/holidays', '/admin/payslips'] },
  { title: 'Approvals', paths: ['/admin/approvals', '/admin/leaves', '/admin/work-from-home', '/admin/onsite-work', '/admin/edit-requests'] },
  { title: 'Reports', paths: ['/admin/reports', '/admin/overview', '/admin/audit-logs'] },
  { title: 'Communication', paths: ['/admin/announcements', '/notifications'] },
  { title: 'System', paths: ['/admin/settings/office', '/settings'] },
];

const isSuperAdmin = (user) => user?.role === ROLES.SUPER_ADMIN;

/** The role's bottom navigation (5 items, Home in the middle). */
export function adminBottomNavFor(user) {
  return isSuperAdmin(user) ? SUPER_ADMIN_BOTTOM_NAV : HR_BOTTOM_NAV;
}

/** Every destination this role can open (desktop sidebar + own pages), labelled for the phone. */
export function adminMobileDestinationsFor(user) {
  const sidebar = getAdminNavItemsForRole(user?.role, user?.permissions).map((i) => ({ ...i, label: LABELS[i.to] || i.label }));
  const personal = isSuperAdmin(user) ? [] : HR_PERSONAL.filter((i) => !i.onsiteOnly || user?.onsiteWorkEligible);
  const extra = isSuperAdmin(user) ? SUPER_ADMIN_EXTRA : [];
  const seen = new Set();
  return [...sidebar, ...extra, ...personal, ...COMMON_PERSONAL].filter((i) => (seen.has(i.to) ? false : seen.add(i.to)));
}

/** Grouped menu: everything not in the bottom nav, nothing dropped ("More" catches the rest). */
export function adminMenuGroupsFor(user) {
  const inNav = new Set(adminBottomNavFor(user).map((i) => i.to));
  const items = adminMobileDestinationsFor(user).filter((i) => !inNav.has(i.to) && i.to !== '/admin/profile');
  const groups = (isSuperAdmin(user) ? SUPER_ADMIN_GROUPS : HR_GROUPS).map((g) => ({ title: g.title, items: g.paths.map((p) => items.find((i) => i.to === p)).filter(Boolean) }));
  const placed = new Set(groups.flatMap((g) => g.items.map((i) => i.to)));
  const leftovers = items.filter((i) => !placed.has(i.to));
  if (leftovers.length) groups.push({ title: 'More', items: leftovers });
  return groups.filter((g) => g.items.length);
}

/** Pages that draw their own compact header (no Back bar). */
export const ADMIN_PRIMARY_ROUTES = ['/admin', ADMIN_MENU_PATH, '/attendance', '/admin/approvals'];

/** Titles for the Back bar on every other page. */
export function adminTitleItemsFor(user) {
  return [
    { to: '/admin/profile', label: 'My Profile', icon: User },
    { to: '/admin/employees/', label: 'Employee', icon: Users },
    ...adminMobileDestinationsFor(user),
    ...adminBottomNavFor(user),
    ...employeeNavItemsFor(user),
    { to: '/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/attendance', label: 'My Attendance', icon: CalendarCheck },
  ];
}

/** Paths under Menu, so the Menu tab stays highlighted while on them. */
export function adminMenuChildrenFor(user) {
  const inNav = new Set(adminBottomNavFor(user).map((i) => i.to));
  return [...adminMobileDestinationsFor(user).map((i) => i.to), '/admin/profile', '/profile'].filter((p) => !inNav.has(p));
}
