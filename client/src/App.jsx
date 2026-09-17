import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { RoleRoute } from './routes/RoleRoute.jsx';
import { EmployeeLayout } from './layouts/EmployeeLayout.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { Login } from './pages/auth/Login.jsx';
import { Signup } from './pages/auth/Signup.jsx';
import { FirstLoginPasswordChange } from './pages/auth/FirstLoginPasswordChange.jsx';
import { NotAuthorized } from './pages/NotAuthorized.jsx';
import { NotFound } from './pages/NotFound.jsx';

import { Dashboard as EmployeeDashboard } from './pages/employee/Dashboard.jsx';
import { Profile } from './pages/employee/Profile.jsx';
import { Attendance } from './pages/employee/Attendance.jsx';
import { Leave } from './pages/employee/Leave.jsx';
import { Tasks } from './pages/employee/Tasks.jsx';
import { Notifications } from './pages/employee/Notifications.jsx';
import { Announcements } from './pages/employee/Announcements.jsx';
import { SettingsPage } from './pages/employee/SettingsPage.jsx';

import { AdminDashboard } from './pages/admin/Dashboard.jsx';
import { Employees } from './pages/admin/Employees.jsx';
import { EmployeeDetail } from './pages/admin/EmployeeDetail.jsx';
import { AdminAttendance } from './pages/admin/AdminAttendance.jsx';
import { AdminLeaves } from './pages/admin/AdminLeaves.jsx';
import { AdminTasks } from './pages/admin/AdminTasks.jsx';
import { Departments } from './pages/admin/Departments.jsx';
import { AdminAnnouncements } from './pages/admin/AdminAnnouncements.jsx';
import { Reports } from './pages/admin/Reports.jsx';
import { AuditLogs } from './pages/admin/AuditLogs.jsx';
import { OfficeSettings } from './pages/admin/OfficeSettings.jsx';
import { EditRequests } from './pages/admin/EditRequests.jsx';

import { MANAGEMENT_ROLES, BACK_OFFICE_ROLES } from './utils/constants.js';

export default function App() {
  return (
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
  );
}
