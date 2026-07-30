import React from 'react';
import { Search, ChevronsDownUp, ChevronsUpDown, X, Info } from 'lucide-react';
import { eventColorFor } from '../theme/eventColors';

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

const INACTIVE_CHIP = 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent';

function chipClass(type: string, active: boolean): string {
  if (!active) return INACTIVE_CHIP;
  return eventColorFor(type).activeChipClass;
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
        {/*
          Every badge below already carries its own explanation as a hover
          title, but a new user has no reason to hover one to discover that —
          this is the one place to look for "what do these mean" up front.
          A native <details>/<summary> disclosure needs no click-outside or
          open-state wiring for something this lightweight.
        */}
        <details className="relative shrink-0">
          <summary
            title="What do these mean?"
            className="flex list-none items-center rounded-md border border-border p-1.5 text-muted-foreground marker:content-none hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden"
          >
            <Info size={14} />
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-80 max-h-80 overflow-y-auto rounded-md border border-border bg-card p-2 text-xs shadow-lg">
            {/*
              A fixed-width first column (not each badge sized to its own
              text) so every description starts at the same x position —
              without it, FLOW's short badge and CODE_UNIT's long one left
              the description column ragged and unreadable as a list.
            */}
            <div className="grid grid-cols-[76px_1fr] items-start gap-x-2 gap-y-2">
              {availableTypes.map((type) => {
                const entry = eventColorFor(type);
                return (
                  <React.Fragment key={type}>
                    <span
                      className={`rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide ${entry.badgeClass}`}
                    >
                      {type}
                    </span>
                    <span className="text-muted-foreground">{entry.description}</span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {availableTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onToggleType(type)}
            title={eventColorFor(type).description}
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
