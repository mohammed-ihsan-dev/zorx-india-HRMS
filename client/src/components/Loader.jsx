import { Loader2 } from 'lucide-react';

export function Loader({ label = 'Loading…', fullScreen = false }) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-2 text-slate-500 py-12">
      <Loader2 size={24} className="animate-spin text-brand-700" />
      <p className="text-sm">{label}</p>
    </div>
  );

  if (fullScreen) {
    return <div className="min-h-screen flex items-center justify-center bg-white">{content}</div>;
  }
  return content;
}
