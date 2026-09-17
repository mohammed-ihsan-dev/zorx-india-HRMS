import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, pages, onPageChange, total }) {
  if (!pages || pages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100">
      <p className="text-xs text-slate-500">
        Page {page} of {pages} {total !== undefined && `· ${total} total`}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="p-1.5 rounded-md border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
