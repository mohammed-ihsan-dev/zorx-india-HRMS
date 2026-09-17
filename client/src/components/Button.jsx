import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-brand-800 text-white hover:bg-brand-900 focus-visible:ring-brand-800 shadow-sm active:scale-[0.99] disabled:bg-brand-800/50',
  secondary: 'bg-brand-100 text-brand-800 hover:bg-brand-200 focus-visible:ring-brand-300 font-bold',
  outline: 'border border-slate-300 text-slate-800 bg-white hover:bg-slate-50 focus-visible:ring-slate-300 shadow-sm',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm active:scale-[0.99] disabled:bg-red-600/50',
};

const SIZES = {
  sm: 'text-sm px-3.5 py-2 min-h-[38px] gap-2 font-medium',
  md: 'text-base px-5 py-2.5 min-h-[44px] gap-2.5 font-semibold',
  lg: 'text-base sm:text-lg px-6 py-3.5 min-h-[50px] gap-3 font-bold',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  icon: Icon,
  ...props
}) {
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin shrink-0" />
      ) : Icon ? (
        <Icon size={iconSize} className="shrink-0" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
