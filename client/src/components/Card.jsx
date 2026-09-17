export function Card({ children, className = '', padded = true, ...props }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 shadow-sm transition-all duration-150 ${
        padded ? 'p-6 sm:p-7' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
      <div>
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-sm sm:text-base text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
