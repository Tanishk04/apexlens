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
  CODE_UNIT: 'bg-code-unit/15 text-code-unit ring-1 ring-inset ring-code-unit/40',
  METHOD: 'bg-method/15 text-method ring-1 ring-inset ring-method/40',
  TRIGGER: 'bg-trigger/15 text-trigger ring-1 ring-inset ring-trigger/40',
  FLOW: 'bg-flow/15 text-flow ring-1 ring-inset ring-flow/40',
  WORKFLOW: 'bg-workflow/15 text-workflow ring-1 ring-inset ring-workflow/40',
  SOQL: 'bg-soql/15 text-soql ring-1 ring-inset ring-soql/40',
  SOSL: 'bg-soql/15 text-soql ring-1 ring-inset ring-soql/40',
  DML: 'bg-dml/15 text-dml ring-1 ring-inset ring-dml/40',
  CALLOUT: 'bg-callout/15 text-callout ring-1 ring-inset ring-callout/40',
  VALIDATION: 'bg-warn/10 text-validation ring-1 ring-inset ring-validation/40',
  VF: 'bg-vf/15 text-vf ring-1 ring-inset ring-vf/40',
  SYSTEM: 'bg-muted text-foreground ring-1 ring-inset ring-border',
  DEBUG: 'bg-debug/15 text-debug ring-1 ring-inset ring-ring',
  EXCEPTION: 'bg-error/15 text-error ring-1 ring-inset ring-error/40',
  GENERIC: 'bg-muted text-foreground ring-1 ring-inset ring-border',
};

const INACTIVE_CHIP = 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent';

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
    <div className="flex flex-col gap-2 border-b border-border bg-card/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter events…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => onToggleDebug(e.target.checked)}
            className="rounded border-input bg-card"
          />
          Debug
        </label>
        <button
          type="button"
          onClick={onExpandAll}
          title="Expand all"
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronsUpDown size={14} />
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          title="Collapse all"
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
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
            className="ml-1 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            <X size={11} /> clear
          </button>
        ) : null}
      </div>
    </div>
  );
};
