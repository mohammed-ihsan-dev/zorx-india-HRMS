export function InfoRow({ label, value }) {
  const isNotProvided = !value || value === '—' || value === 'Unassigned';
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm font-semibold text-slate-500 shrink-0">{label}</dt>
      <dd className="text-base font-medium text-slate-800 text-right">
        {isNotProvided ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200/80">
            Not Provided
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
