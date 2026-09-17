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
} from 'lucide-react';
import { ROLES } from '../utils/constants.js';

export const employeeNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/profile', label: 'My Profile', icon: User },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/leave', label: 'Leave', icon: CalendarClock },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const adminNavItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/admin/leaves', label: 'Leave Requests', icon: CalendarClock },
  { to: '/admin/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/admin/departments', label: 'Departments', icon: Building2 },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldCheck, superAdminOnly: true },
  { to: '/admin/settings/office', label: 'Office Settings', icon: Settings, superAdminOnly: true },
];

export function getAdminNavItemsForRole(role) {
  if (role === ROLES.SUPER_ADMIN) {
    return adminNavItems;
  }
  // Admin / HR module
  return adminNavItems.filter((item) => !item.superAdminOnly);
}
