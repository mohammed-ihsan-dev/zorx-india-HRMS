import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, pages, onPageChange, total, limit = 10, itemLabel = 'logs' }) {
  if (!pages || pages <= 1) {
    if (total > 0 && limit) {
      return (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500">
            Showing 1–{total} of {total} {itemLabel}
          </p>
        </div>
      );
    }
    return null;
  }

  const from = total > 0 ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, total);

  const pageNumbers = [];
  const maxButtons = 5;
  let startPage = Math.max(1, page - 2);
  let endPage = Math.min(pages, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    pageNumbers.push(p);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500">
        {total !== undefined ? `Showing ${from}–${to} of ${total} ${itemLabel}` : `Page ${page} of ${pages}`}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous Page"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {startPage > 1 && (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                page === 1 ? 'bg-brand-700 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              1
            </button>
            {startPage > 2 && <span className="text-xs text-slate-400 px-0.5">…</span>}
          </>
        )}

        {pageNumbers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
              page === p ? 'bg-brand-700 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {p}
          </button>
        ))}

        {endPage < pages && (
          <>
            {endPage < pages - 1 && <span className="text-xs text-slate-400 px-0.5">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(pages)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                page === pages ? 'bg-brand-700 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {pages}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next Page"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
