export function Input({ label, error, hint, className = '', id, ...props }) {
  const inputId = id || props.name;
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={inputId} className="text-[15px] font-semibold text-slate-800 tracking-tight">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-xl border px-4 py-3 min-h-[46px] text-base text-slate-900 bg-white placeholder:text-slate-400 outline-none transition-all duration-150 focus:ring-2 focus:ring-brand-200 focus:border-brand-600 shadow-sm ${
          error ? 'border-red-400 focus:ring-red-100 focus:border-red-500' : 'border-slate-300'
        } ${className}`}
        {...props}
      />
      {hint && !error && <p className="text-sm text-slate-500">{hint}</p>}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function Select({ label, error, hint, className = '', id, children, ...props }) {
  const selectId = id || props.name;
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={selectId} className="text-[15px] font-semibold text-slate-800 tracking-tight">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full rounded-xl border px-4 py-3 min-h-[46px] text-base text-slate-900 outline-none transition-all duration-150 focus:ring-2 focus:ring-brand-200 focus:border-brand-600 bg-white shadow-sm ${
          error ? 'border-red-400 focus:ring-red-100 focus:border-red-500' : 'border-slate-300'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {hint && !error && <p className="text-sm text-slate-500">{hint}</p>}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, hint, className = '', id, ...props }) {
  const areaId = id || props.name;
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={areaId} className="text-[15px] font-semibold text-slate-800 tracking-tight">
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        className={`w-full rounded-xl border px-4 py-3 text-base text-slate-900 bg-white placeholder:text-slate-400 outline-none transition-all duration-150 focus:ring-2 focus:ring-brand-200 focus:border-brand-600 shadow-sm ${
          error ? 'border-red-400 focus:ring-red-100 focus:border-red-500' : 'border-slate-300'
        } ${className}`}
        {...props}
      />
      {hint && !error && <p className="text-sm text-slate-500">{hint}</p>}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
