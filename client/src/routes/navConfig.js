import {
  LayoutDashboard,
  User,
  CalendarCheck,
  CalendarClock,
  ListChecks,
  Bell,
  Megaphone,
  Settings,
  Users,
  Building2,
  FileBarChart,
  ShieldCheck,
  CalendarDays,
  House,
  ReceiptText,
  PartyPopper,
  MapPin,
} from 'lucide-react';
import { ROLES, PERMISSIONS } from '../utils/constants.js';

export const employeeNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/profile', label: 'My Profile', icon: User },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/leave', label: 'Leave', icon: CalendarClock },
  { to: '/work-from-home', label: 'Work From Home', icon: House },
  // Only for employees enabled on the server (login/me → onsiteWorkEligible).
  { to: '/onsite-work', label: 'Onsite Work', icon: MapPin, onsiteOnly: true },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/content-calendar', label: 'Content Calendar', icon: CalendarDays },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Phone-only entries: shown in the mobile Menu, not in the tablet/desktop sidebar.
export const employeeMobileMenuItems = [{ to: '/payslips', label: 'Payslips', icon: ReceiptText }];

export const adminNavItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/admin/leaves', label: 'Leave Requests', icon: CalendarClock },
  { to: '/admin/work-from-home', label: 'Work From Home', icon: House },
  { to: '/admin/onsite-work', label: 'Onsite Work', icon: MapPin, permission: PERMISSIONS.ONSITE_WORK_REVIEW },
  { to: '/admin/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/admin/content-calendar', label: 'Content Calendar', icon: CalendarDays },
  { to: '/admin/payslips', label: 'Payslips', icon: ReceiptText },
  { to: '/admin/holidays', label: 'Holidays', icon: PartyPopper },
  { to: '/admin/departments', label: 'Departments', icon: Building2 },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldCheck, superAdminOnly: true },
  { to: '/admin/settings/office', label: 'Office Settings', icon: Settings, superAdminOnly: true },
];

export function getAdminNavItemsForRole(role, permissions = []) {
  const byPermission = (item) => !item.permission || permissions.includes(item.permission);
  if (role === ROLES.SUPER_ADMIN) {
    return adminNavItems.filter(byPermission);
  }
  // Admin / HR module
  return adminNavItems.filter((item) => !item.superAdminOnly && byPermission(item));
}

/** Employee pages for this user (Onsite Work only where the server enabled it). */
export function employeeNavItemsFor(user) {
  return employeeNavItems.filter((item) => !item.onsiteOnly || user?.onsiteWorkEligible);
}
