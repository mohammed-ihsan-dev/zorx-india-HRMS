import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { ZorxLogo } from './ZorxLogo.jsx';

export function Sidebar({ items, open, onClose, footer, theme = 'dark' }) {
  const isDark = theme === 'dark';

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-30 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 h-full w-72 flex flex-col z-40 shrink-0 transition-transform duration-200 ease-in-out border-r ${isDark
            ? 'bg-brand-950 text-brand-100 border-brand-900'
            : 'bg-white text-slate-800 border-slate-200'
          } ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Sidebar Header with Brand Logo */}
        <div
          className={`flex items-center justify-between px-6 py-5 border-b ${isDark ? 'border-white/10' : 'border-slate-100'
            }`}
        >
          <div className="flex items-center">
            <ZorxLogo variant={isDark ? 'white' : 'green'} size="sidebar" />
          </div>
          <button
            onClick={onClose}
            className={`lg:hidden p-1.5 rounded-lg transition-colors ${isDark
                ? 'text-brand-300 hover:text-white hover:bg-white/10'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
          >
            <X size={22} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-5 px-4 space-y-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3.5 px-4 py-3 rounded-xl text-[15px] font-semibold transition-all duration-150 ${isActive
                  ? isDark
                    ? 'bg-brand-800 text-white shadow-sm ring-1 ring-white/15'
                    : 'bg-brand-50 text-brand-900 font-bold border-l-4 border-brand-700'
                  : isDark
                    ? 'text-brand-200 hover:bg-white/10 hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <item.icon size={20} className="shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {footer && (
          <div
            className={`px-5 py-4 border-t ${isDark ? 'border-white/10' : 'border-slate-100'
              }`}
          >
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}
