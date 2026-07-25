import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';
import type { LogEventLine } from '../../types';
import { DebugIcon } from '../icons/DebugIcon';

interface Props {
  lines: LogEventLine[];
}

interface DebugRow {
  id: string;
  lineNumber: number;
  level: string;
  message: string;
  timestampNs: number;
}

const LEVEL_COLOR: Record<string, string> = {
  ERROR: 'bg-error/10 text-error',
  WARN: 'bg-warn/10 text-validation',
  INFO: 'bg-debug/15 text-debug',
  DEBUG: 'bg-muted text-foreground',
  FINE: 'bg-muted text-muted-foreground',
  FINER: 'bg-muted text-muted-foreground',
  FINEST: 'bg-muted text-muted-foreground',
};

/**
 * USER_DEBUG payload is LEVEL|message — the `[line]` token was already captured
 * into lineNumber by the Lexer. Large payloads (a List, Map or JSON blob) span
 * several log lines; the parser collects the untimestamped remainder into
 * `continuation`, which belongs to this message just as much as the first line.
 */
function toDebugRow(line: LogEventLine): DebugRow {
  const parts = line.payload.split('|');
  const level = (parts[0] ?? '').trim().toUpperCase();
  const known = level in LEVEL_COLOR;
  const head = known ? parts.slice(1).join('|') : line.payload;
  return {
    id: line.id,
    lineNumber: line.lineNumber,
    level: known ? level : 'DEBUG',
    message: line.continuation ? `${head}\n${line.continuation}` : head,
    timestampNs: line.timestampNs,
  };
}

/** Collapsed rows clamp to this many lines; clicking expands to the full text. */
const CLAMP_LINES = 3;

export const DebugView = ({ lines }: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const debugRows = useMemo(
    () => lines.filter((l) => l.event.startsWith('USER_DEBUG')).map(toDebugRow),
    [lines],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return debugRows;
    return debugRows.filter(
      (r) => r.message.toLowerCase().includes(q) || r.level.toLowerCase().includes(q),
    );
  }, [debugRows, query]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    // Debug messages wrap, so a row's real height is only known once rendered.
    // With a fixed estimate every row was positioned at index * 28 while tall
    // ones grew past their slot — which is what made long System.debug() output
    // paint on top of the rows beneath it (issue #1). Same approach as
    // VirtualTable.
    measureElement: (el) => el.getBoundingClientRect().height,
    // Lower than the usual 25: measuring wrapped rows is not free.
    overscan: 8,
  });

  // Expanding a row changes its height from our own state, so re-measure it
  // directly rather than waiting on the virtualizer's ResizeObserver. The
  // observer would normally catch it, but it only delivers as part of the
  // rendering lifecycle — so relying on it alone leaves the rows below sitting
  // at stale offsets in any context where frames aren't being produced
  // (background tab, hidden pane). Cheap: only mounted rows are measured.
  useLayoutEffect(() => {
    const container = parentRef.current;
    if (!container) return;
    for (const el of container.querySelectorAll<HTMLElement>('[data-index]')) {
      rowVirtualizer.measureElement(el);
    }
    // rowVirtualizer is a new object every render (react-virtual's documented
    // behavior) — including it would re-measure on every render, not just when
    // an expansion actually changed a row's height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  if (debugRows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <DebugIcon size={64} className="text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">No USER_DEBUG statements in this log.</p>
        <p className="max-w-sm text-xs text-muted-foreground/70">
          Add <span className="font-mono text-muted-foreground">System.debug(…)</span> calls, or check that
          the <span className="font-mono text-muted-foreground">APEX_CODE</span> trace level is DEBUG or
          finer.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search debug output…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {rows.length.toLocaleString()} statements
        </span>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index]!;
            const isExpanded = expanded.has(row.id);
            return (
              <div
                key={row.id}
                ref={rowVirtualizer.measureElement}
                data-index={vr.index}
                onClick={() => toggleExpand(row.id)}
                title={isExpanded ? 'Click to collapse' : 'Click to expand'}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vr.start}px)`,
                }}
                className="flex cursor-pointer items-baseline gap-3 border-b border-border/40 px-4 py-1 hover:bg-accent/60"
              >
                <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-xs text-muted-foreground/70">
                  {row.lineNumber ? row.lineNumber : ''}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    LEVEL_COLOR[row.level] ?? LEVEL_COLOR.DEBUG
                  }`}
                >
                  {row.level}
                </span>
                <span
                  className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs text-foreground"
                  style={
                    isExpanded
                      ? undefined
                      : {
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: CLAMP_LINES,
                          overflow: 'hidden',
                        }
                  }
                >
                  {row.message}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
