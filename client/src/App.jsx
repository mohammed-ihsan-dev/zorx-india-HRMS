import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { RoleRoute } from './routes/RoleRoute.jsx';
import { EmployeeLayout } from './layouts/EmployeeLayout.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { Loader } from './components/Loader.jsx';
import { Login } from './pages/auth/Login.jsx';
import { Signup } from './pages/auth/Signup.jsx';

import { MANAGEMENT_ROLES, BACK_OFFICE_ROLES } from './utils/constants.js';

// Route-level code splitting: everything behind auth loads on demand instead of
// bloating the initial bundle every visitor downloads just to see the login page.
const FirstLoginPasswordChange = lazy(() => import('./pages/auth/FirstLoginPasswordChange.jsx').then((m) => ({ default: m.FirstLoginPasswordChange })));
const NotAuthorized = lazy(() => import('./pages/NotAuthorized.jsx').then((m) => ({ default: m.NotAuthorized })));
const NotFound = lazy(() => import('./pages/NotFound.jsx').then((m) => ({ default: m.NotFound })));

const EmployeeDashboard = lazy(() => import('./pages/employee/Dashboard.jsx').then((m) => ({ default: m.Dashboard })));
const Profile = lazy(() => import('./pages/employee/Profile.jsx').then((m) => ({ default: m.Profile })));
const Attendance = lazy(() => import('./pages/employee/Attendance.jsx').then((m) => ({ default: m.Attendance })));
const Leave = lazy(() => import('./pages/employee/Leave.jsx').then((m) => ({ default: m.Leave })));
const Tasks = lazy(() => import('./pages/employee/Tasks.jsx').then((m) => ({ default: m.Tasks })));
const Notifications = lazy(() => import('./pages/employee/Notifications.jsx').then((m) => ({ default: m.Notifications })));
const Announcements = lazy(() => import('./pages/employee/Announcements.jsx').then((m) => ({ default: m.Announcements })));
const SettingsPage = lazy(() => import('./pages/employee/SettingsPage.jsx').then((m) => ({ default: m.SettingsPage })));

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard.jsx').then((m) => ({ default: m.AdminDashboard })));
const Employees = lazy(() => import('./pages/admin/Employees.jsx').then((m) => ({ default: m.Employees })));
const EmployeeDetail = lazy(() => import('./pages/admin/EmployeeDetail.jsx').then((m) => ({ default: m.EmployeeDetail })));
const AdminAttendance = lazy(() => import('./pages/admin/AdminAttendance.jsx').then((m) => ({ default: m.AdminAttendance })));
const AdminLeaves = lazy(() => import('./pages/admin/AdminLeaves.jsx').then((m) => ({ default: m.AdminLeaves })));
const AdminTasks = lazy(() => import('./pages/admin/AdminTasks.jsx').then((m) => ({ default: m.AdminTasks })));
const Departments = lazy(() => import('./pages/admin/Departments.jsx').then((m) => ({ default: m.Departments })));
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements.jsx').then((m) => ({ default: m.AdminAnnouncements })));
const Reports = lazy(() => import('./pages/admin/Reports.jsx').then((m) => ({ default: m.Reports })));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs.jsx').then((m) => ({ default: m.AuditLogs })));
const OfficeSettings = lazy(() => import('./pages/admin/OfficeSettings.jsx').then((m) => ({ default: m.OfficeSettings })));
const EditRequests = lazy(() => import('./pages/admin/EditRequests.jsx').then((m) => ({ default: m.EditRequests })));

function RouteFallback() {
  return <Loader fullScreen label="Loading…" />;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/not-authorized" element={<NotAuthorized />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/change-password" element={<FirstLoginPasswordChange />} />
          <Route element={<EmployeeLayout />}>
            <Route path="/" element={<EmployeeDashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/leave" element={<Leave />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route element={<RoleRoute roles={MANAGEMENT_ROLES} />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/employees" element={<Employees />} />
              <Route path="/admin/employees/:id" element={<EmployeeDetail />} />
              <Route path="/admin/attendance" element={<AdminAttendance />} />
              <Route path="/admin/leaves" element={<AdminLeaves />} />
              <Route path="/admin/tasks" element={<AdminTasks />} />

              <Route element={<RoleRoute roles={BACK_OFFICE_ROLES} />}>
                <Route path="/admin/departments" element={<Departments />} />
                <Route path="/admin/announcements" element={<AdminAnnouncements />} />
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/audit-logs" element={<AuditLogs />} />
                <Route path="/admin/edit-requests" element={<EditRequests />} />
                <Route path="/admin/settings/office" element={<OfficeSettings />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
