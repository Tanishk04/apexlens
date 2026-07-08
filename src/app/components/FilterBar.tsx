import React from 'react';
import { Search, ChevronsDownUp, ChevronsUpDown, X } from 'lucide-react';

interface FilterBarProps {
  availableTypes: string[];
  activeTypes: Set<string>;
  onToggleType: (type: string) => void;
  onClearTypes: () => void;
  search: string;
  onSearch: (value: string) => void;
  showDebug: boolean;
  onToggleDebug: (value: boolean) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

// Full static class strings so Tailwind's scanner can see them (no runtime interpolation).
const ACTIVE_CHIP: Record<string, string> = {
  CODE_UNIT: 'bg-amber-500/20 text-amber-300 ring-1 ring-inset ring-amber-500/40',
  METHOD: 'bg-purple-500/20 text-purple-300 ring-1 ring-inset ring-purple-500/40',
  TRIGGER: 'bg-orange-500/20 text-orange-300 ring-1 ring-inset ring-orange-500/40',
  FLOW: 'bg-cyan-500/20 text-cyan-300 ring-1 ring-inset ring-cyan-500/40',
  WORKFLOW: 'bg-teal-500/20 text-teal-300 ring-1 ring-inset ring-teal-500/40',
  SOQL: 'bg-green-500/20 text-green-300 ring-1 ring-inset ring-green-500/40',
  SOSL: 'bg-green-500/20 text-green-300 ring-1 ring-inset ring-green-500/40',
  DML: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/40',
  CALLOUT: 'bg-sky-500/20 text-sky-300 ring-1 ring-inset ring-sky-500/40',
  VALIDATION: 'bg-yellow-500/20 text-yellow-300 ring-1 ring-inset ring-yellow-500/40',
  VF: 'bg-pink-500/20 text-pink-300 ring-1 ring-inset ring-pink-500/40',
  SYSTEM: 'bg-zinc-600/30 text-zinc-200 ring-1 ring-inset ring-zinc-500/40',
  DEBUG: 'bg-blue-500/20 text-blue-300 ring-1 ring-inset ring-blue-500/40',
  EXCEPTION: 'bg-red-500/20 text-red-300 ring-1 ring-inset ring-red-500/40',
  GENERIC: 'bg-zinc-600/30 text-zinc-200 ring-1 ring-inset ring-zinc-500/40',
};

const INACTIVE_CHIP = 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800';

function chipClass(type: string, active: boolean): string {
  if (!active) return INACTIVE_CHIP;
  return ACTIVE_CHIP[type] ?? ACTIVE_CHIP.GENERIC!;
}

export const FilterBar = ({
  availableTypes,
  activeTypes,
  onToggleType,
  onClearTypes,
  search,
  onSearch,
  showDebug,
  onToggleDebug,
  onExpandAll,
  onCollapseAll,
}: FilterBarProps) => {
  const hasFilter = activeTypes.size > 0;

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter events…"
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => onToggleDebug(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-900"
          />
          Debug
        </label>
        <button
          type="button"
          onClick={onExpandAll}
          title="Expand all"
          className="shrink-0 rounded-md border border-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ChevronsUpDown size={14} />
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          title="Collapse all"
          className="shrink-0 rounded-md border border-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ChevronsDownUp size={14} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {availableTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onToggleType(type)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${chipClass(
              type,
              activeTypes.has(type),
            )}`}
          >
            {type}
          </button>
        ))}
        {hasFilter ? (
          <button
            type="button"
            onClick={onClearTypes}
            className="ml-1 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 hover:text-zinc-300"
          >
            <X size={11} /> clear
          </button>
        ) : null}
      </div>
    </div>
  );
};
