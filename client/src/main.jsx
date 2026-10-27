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
