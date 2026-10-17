import { ZorxLogo } from '../../components/ZorxLogo.jsx';

/** Centered card matching the Login form, for the password-recovery pages. */
export function AuthCardLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 sm:p-12 font-sans">
      <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/90 shadow-card-lg">
        <div className="flex flex-col items-center mb-8 text-center">
          <ZorxLogo variant="green" size="login" className="mb-4" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">{title}</h1>
          {subtitle && <p className="text-base text-slate-600 mt-1.5">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
