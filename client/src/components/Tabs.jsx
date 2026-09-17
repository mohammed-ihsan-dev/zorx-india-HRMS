export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 overflow-x-auto scrollbar-thin -mb-px">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-sm sm:text-base font-bold whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? 'border-brand-700 text-brand-800'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {tab.icon && <tab.icon size={17} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
