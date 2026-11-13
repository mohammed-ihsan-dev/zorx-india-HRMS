import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { OfflineBanner } from './pwa/OfflineBanner.jsx';
import { UpdateToast } from './pwa/UpdateToast.jsx';
import { AppUpdateProvider } from './pwa/AppUpdateContext.jsx';
import { InstallPrompt } from './pwa/InstallPrompt.jsx';
import { MobileChromeSync } from './pwa/MobileChromeSync.jsx';
import './styles/index.css';
import { startAttendanceBoot } from './features/attendance/attendanceBoot.js';
import { getMyAttendanceToday } from './services/attendanceService.js';
import { getMyWfhToday } from './services/wfhService.js';

// Attendance-first: for a signed-in user opening a dashboard, start today's
// attendance request and the dashboard code now, in parallel with /auth/me.
if (startAttendanceBoot({ load: () => Promise.all([getMyAttendanceToday(), getMyWfhToday().catch(() => null)]) })) {
  if (window.location.pathname === '/admin') import('./pages/admin/Dashboard.jsx');
  else import('./pages/employee/Dashboard.jsx');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider>
          <AppUpdateProvider>
            <MobileChromeSync />
            <OfflineBanner />
            <App />
            <UpdateToast />
            <InstallPrompt />
          </AppUpdateProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
