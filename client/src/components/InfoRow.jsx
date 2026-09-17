export function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm font-semibold text-slate-500 shrink-0">{label}</dt>
      <dd className="text-base font-medium text-slate-800 text-right">{value || <span className="text-slate-400 font-normal">Not provided</span>}</dd>
    </div>
  );
}
