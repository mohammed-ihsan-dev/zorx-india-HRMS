const COLOR_MAP = {
  green: 'bg-brand-100/90 text-brand-900 border-brand-300 font-bold',
  amber: 'bg-amber-100/90 text-amber-900 border-amber-300 font-bold',
  red: 'bg-red-100/90 text-red-900 border-red-300 font-bold',
  blue: 'bg-sky-100/90 text-sky-900 border-sky-300 font-bold',
  slate: 'bg-slate-100 text-slate-800 border-slate-300 font-bold',
};

export function Badge({ children, color = 'slate', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs sm:text-sm font-bold whitespace-nowrap shadow-2xs ${COLOR_MAP[color] || COLOR_MAP.slate} ${className}`}
    >
      {children}
    </span>
  );
}
