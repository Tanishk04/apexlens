import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react';
import type { LogEventLine } from '../../types';
import { buildRawRows, visibleRawRows } from '../utils/rawTree';

interface Props {
  lines: LogEventLine[];
}

// Muted event-name colors by coarse category (raw view stays low-key).
const EVENT_COLOR: Record<string, string> = {
  SOQL: 'text-soql',
  SOSL: 'text-soql',
  DML: 'text-dml',
  CALLOUT: 'text-callout',
  FLOW: 'text-flow',
  WORKFLOW: 'text-workflow',
  VALIDATION: 'text-validation',
  VF: 'text-vf',
  METHOD: 'text-method',
  CODE_UNIT: 'text-code-unit',
  SYSTEM: 'text-muted-foreground',
  GENERIC: 'text-muted-foreground',
};

export const RawTreeView = ({ lines }: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const allRows = useMemo(() => buildRawRows(lines), [lines]);

  const rows = useMemo(() => {
    const vis = visibleRawRows(allRows, collapsed);
    const q = query.trim().toLowerCase();
    if (!q) return vis;
    // Text filter flattens matches (nesting context lost while filtering).
    return allRows.filter(
      (r) => r.event.toLowerCase().includes(q) || r.payload.toLowerCase().includes(q),
    );
  }, [allRows, collapsed, query]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 30,
  });

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const collapseAll = () =>
    setCollapsed(new Set(allRows.filter((r) => r.expandable).map((r) => r.id)));

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter raw events…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {rows.length.toLocaleString()} / {allRows.length.toLocaleString()} events
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(new Set())}
          title="Expand all"
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronsUpDown size={14} />
        </button>
        <button
          type="button"
          onClick={collapseAll}
          title="Collapse all"
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronsDownUp size={14} />
        </button>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index]!;
            const color = EVENT_COLOR[row.category] ?? EVENT_COLOR.GENERIC!;
            return (
              <div
                key={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 'max-content',
                  minWidth: '100%',
                  height: vr.size,
                  transform: `translateY(${vr.start}px)`,
                }}
                className="flex items-center gap-2 whitespace-nowrap pr-4 hover:bg-accent/60"
              >
                <div className="shrink-0" style={{ width: `${row.depth * 16 + 8}px` }} />
                {row.expandable && !query ? (
                  <button
                    type="button"
                    onClick={() => toggle(row.id)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={collapsed.has(row.id) ? 'Expand' : 'Collapse'}
                  >
                    <ChevronRight
                      size={12}
                      className={`transition-transform ${collapsed.has(row.id) ? '' : 'rotate-90'}`}
                    />
                  </button>
                ) : (
                  <div className="w-[18px] shrink-0" />
                )}
                <span className={`shrink-0 ${color}`}>{row.event}</span>
                {row.lineNumber ? (
                  <span className="shrink-0 text-muted-foreground/70">[{row.lineNumber}]</span>
                ) : null}
                <span className="text-muted-foreground">{row.payload}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
