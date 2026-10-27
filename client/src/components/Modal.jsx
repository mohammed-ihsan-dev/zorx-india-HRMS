import { useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useMobileShell } from '../context/MobileShellContext.jsx';

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  // The portal renders outside the phone shell, so it re-applies the shell's
  // dark theme itself; tablet/desktop (mobile === false) are unchanged.
  const mobile = useMobileShell();
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return createPortal(
    <div data-zm-modal className={`fixed inset-0 z-50 flex items-center justify-center p-4${mobile ? ' zm-mobile zm-portal zm-modal-safe' : ''}`}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${sizeClass} bg-white shadow-popover border border-slate-200 ${mobile ? 'rounded-2xl max-h-full' : 'rounded-xl max-h-[90vh]'} flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className={`text-slate-400 hover:text-slate-600 rounded-md ${mobile ? 'p-2.5 -m-1.5' : 'p-1'}`}>
            <X size={18} />
          </button>
        </div>
        <div className={`px-5 py-4 overflow-y-auto${mobile ? ' overscroll-contain' : ''}`}>{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
