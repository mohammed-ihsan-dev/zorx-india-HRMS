import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { OfflineBanner } from './pwa/OfflineBanner.jsx';
import { UpdateToast } from './pwa/UpdateToast.jsx';
import { AppUpdateProvider } from './pwa/AppUpdateContext.jsx';
import { InstallPrompt } from './pwa/InstallPrompt.jsx';
import { MobileChromeSync } from './pwa/MobileChromeSync.jsx';
import './styles/index.css';
import { startAttendanceBoot } from './features/attendance/attendanceBoot.js';
import { getMyAttendanceToday, primeAttendanceToday } from './services/attendanceService.js';
import { getMyWfhToday } from './services/wfhService.js';
import { startSessionBoot } from './services/sessionBoot.js';
import { currentIdentity } from './services/session.js';

// Restore the session now (one request; on a dashboard it also returns today's
// attendance), in parallel with downloading the dashboard code.
const bootRestore = startSessionBoot();
if (
  startAttendanceBoot({
    signedIn: Boolean(bootRestore),
    identity: currentIdentity,
    load: async () => {
      const restored = await bootRestore;
      if (!restored) throw new Error('signed out');
      if (restored.today) primeAttendanceToday(restored.today.attendance); // break reminders reuse it
      const value = restored.today
        ? [restored.today.attendance, restored.today.wfh]
        : await Promise.all([getMyAttendanceToday(), getMyWfhToday().catch(() => null)]);
      return { identity: currentIdentity(), value };
    },
  })
) {
  if (window.location.pathname === '/admin') import('./pages/admin/AdminHome.jsx');
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
            <AppErrorBoundary>
              <App />
            </AppErrorBoundary>
            <UpdateToast />
            <InstallPrompt />
          </AppUpdateProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
