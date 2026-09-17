export function StatCard({ label, value, icon: Icon, tone = 'default', hint }) {
  const toneClasses = {
    default: 'bg-brand-50 text-brand-800 border-brand-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-800 border-red-200',
    blue: 'bg-sky-50 text-sky-800 border-sky-200',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-7 flex items-start justify-between gap-4">
      <div>
        <p className="text-xs sm:text-sm uppercase tracking-wider font-bold text-slate-500">{label}</p>
        <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2 tracking-tight">{value}</p>
        {hint && <p className="text-sm font-medium text-slate-500 mt-2">{hint}</p>}
      </div>
      {Icon && (
        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-2xs ${toneClasses[tone] || toneClasses.default}`}>
          <Icon size={24} />
        </div>
      )}
    </div>
  );
}
