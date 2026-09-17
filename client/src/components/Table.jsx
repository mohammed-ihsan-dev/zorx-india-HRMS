export function Table({ columns, data, keyField = '_id', emptyState, loading }) {
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-base">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((col) => (
                <th key={col.key} className="text-xs uppercase font-bold text-slate-500 tracking-wider py-4 px-5 whitespace-nowrap">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className="py-4 px-5">
                    <div className="h-5 bg-slate-100 rounded-md animate-pulse w-full max-w-[150px]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return emptyState || null;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/90 shadow-xs">
      <table className="w-full text-left text-[15px]">
        <thead>
          <tr className="bg-slate-50/90 border-b border-slate-200">
            {columns.map((col) => (
              <th key={col.key} className="text-xs uppercase font-bold text-slate-500 tracking-wider py-4 px-5 whitespace-nowrap">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {data.map((row) => (
            <tr key={row[keyField]} className="hover:bg-brand-50/30 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="py-4 px-5 text-slate-800 whitespace-nowrap font-medium">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
