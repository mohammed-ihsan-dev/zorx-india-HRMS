import { useEffect, useRef, useState } from 'react';

export function Dropdown({ trigger, children, align = 'right', responsive = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const positionClasses = responsive
    ? 'fixed left-3 right-3 top-16 sm:absolute sm:top-full sm:inset-auto sm:mt-2 sm:right-0 max-w-[calc(100vw-1.5rem)] sm:max-w-none'
    : align === 'right'
    ? 'absolute right-0 mt-2 max-w-[calc(100vw-1.5rem)]'
    : 'absolute left-0 mt-2 max-w-[calc(100vw-1.5rem)]';

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={`z-50 bg-white rounded-2xl sm:rounded-xl border border-slate-200 shadow-card-lg py-1.5 ${positionClasses} ${className}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, className = '', ...props }) {
  return (
    <button
      className={`w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
