import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import type { LogEventLine } from '../../types';
import { buildRawRows, visibleRawRows } from '../utils/rawTree';
import { computeMatches, splitByMatch, type FindState } from '../utils/find';
import { Minimap, type MinimapLine } from './Minimap';

interface Props {
  lines: LogEventLine[];
  find: FindState;
  onMatches: (count: number) => void;
  theme?: string;
}

const ROW_H = 24;

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

const COLOR_VAR: Record<string, string> = {
  SOQL: '--c-soql',
  SOSL: '--c-soql',
  DML: '--c-dml',
  CALLOUT: '--c-callout',
  FLOW: '--c-flow',
  WORKFLOW: '--c-workflow',
  VALIDATION: '--c-validation',
  VF: '--c-vf',
  METHOD: '--c-method',
  CODE_UNIT: '--c-code-unit',
  SYSTEM: '--c-system',
  GENERIC: '--c-system',
};

export const RawTreeView = ({ lines, find, onMatches, theme }: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const allRows = useMemo(() => buildRawRows(lines), [lines]);
  const rows = useMemo(() => visibleRawRows(allRows, collapsed), [allRows, collapsed]);

  // Find over the visible rows (event + payload).
  const rowTexts = useMemo(() => rows.map((r) => `${r.event} ${r.payload}`), [rows]);
  const matches = useMemo(
    () => computeMatches(rowTexts, find.query, find.caseSensitive),
    [rowTexts, find.query, find.caseSensitive],
  );

  useEffect(() => {
    onMatches(matches.length);
  }, [matches, onMatches]);

  const minimapLines = useMemo<MinimapLine[]>(
    () =>
      rows.map((r) => ({
        offset: r.depth,
        length: r.event.length + r.payload.length,
        colorVar: COLOR_VAR[r.category] ?? '--c-system',
      })),
    [rows],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 30,
  });

  const activeRow = matches.length > 0 ? matches[find.index % matches.length]! : -1;
  useEffect(() => {
    if (activeRow >= 0) rowVirtualizer.scrollToIndex(activeRow, { align: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const collapseAll = () =>
    setCollapsed(new Set(allRows.filter((r) => r.expandable).map((r) => r.id)));

  const highlight = (text: string, cls: string, active: boolean) => {
    if (!find.query) return <span className={cls}>{text}</span>;
    return splitByMatch(text, find.query, find.caseSensitive).map((seg, i) =>
      seg.match ? (
        <mark
          key={i}
          className={`rounded-sm px-0 ${
            active ? 'bg-warn text-background' : 'bg-warn/40 text-foreground'
          }`}
        >
          {seg.text}
        </mark>
      ) : (
        <span key={i} className={cls}>
          {seg.text}
        </span>
      ),
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-3 py-1.5">
        <span className="mr-auto text-xs text-muted-foreground">
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

      <div className="flex min-h-0 flex-1">
        <div ref={parentRef} className="min-h-0 min-w-0 flex-1 overflow-auto font-mono text-xs">
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const row = rows[vr.index]!;
              const color = EVENT_COLOR[row.category] ?? EVENT_COLOR.GENERIC!;
              const isActive = vr.index === activeRow;
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
                  className={`flex items-center gap-2 whitespace-nowrap pr-4 ${
                    isActive ? 'bg-warn/15' : 'hover:bg-accent/60'
                  }`}
                >
                  <div className="shrink-0" style={{ width: `${row.depth * 16 + 8}px` }} />
                  {row.expandable ? (
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
                  <span className="shrink-0">{highlight(row.event, color, isActive)}</span>
                  {row.lineNumber ? (
                    <span className="shrink-0 text-muted-foreground/70">[{row.lineNumber}]</span>
                  ) : null}
                  <span>{highlight(row.payload, 'text-foreground', isActive)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <Minimap
          lines={minimapLines}
          scrollRef={parentRef}
          rowHeight={ROW_H}
          matchIndexes={matches}
          theme={theme}
        />
      </div>
    </div>
  );
};
