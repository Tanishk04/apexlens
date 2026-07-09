import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Bug, Search } from 'lucide-react';
import type { LogEventLine } from '../../types';

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
  ERROR: 'bg-red-500/15 text-red-400',
  WARN: 'bg-yellow-500/15 text-yellow-400',
  INFO: 'bg-blue-500/15 text-blue-400',
  DEBUG: 'bg-zinc-700/40 text-zinc-300',
  FINE: 'bg-zinc-800 text-zinc-400',
  FINER: 'bg-zinc-800 text-zinc-400',
  FINEST: 'bg-zinc-800 text-zinc-500',
};

/** USER_DEBUG payload: [line]|LEVEL|message — level is the first pipe field. */
function toDebugRow(line: LogEventLine): DebugRow {
  const parts = line.payload.split('|');
  const level = (parts[0] ?? '').trim().toUpperCase();
  const known = level in LEVEL_COLOR;
  return {
    id: line.id,
    lineNumber: line.lineNumber,
    level: known ? level : 'DEBUG',
    message: known ? parts.slice(1).join('|') : line.payload,
    timestampNs: line.timestampNs,
  };
}

export const DebugView = ({ lines }: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');

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
    overscan: 25,
  });

  if (debugRows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 p-8 text-center">
        <Bug size={28} className="text-zinc-700" />
        <p className="text-sm text-zinc-500">No USER_DEBUG statements in this log.</p>
        <p className="max-w-sm text-xs text-zinc-600">
          Add <span className="font-mono text-zinc-500">System.debug(…)</span> calls, or check that
          the <span className="font-mono text-zinc-500">APEX_CODE</span> trace level is DEBUG or
          finer.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/60 px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search debug output…"
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <span className="shrink-0 text-xs text-zinc-500">
          {rows.length.toLocaleString()} statements
        </span>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index]!;
            return (
              <div
                key={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  minHeight: vr.size,
                  transform: `translateY(${vr.start}px)`,
                }}
                className="flex items-start gap-3 border-b border-zinc-900 px-4 py-1 hover:bg-zinc-900/50"
              >
                <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-xs text-zinc-600">
                  {row.lineNumber ? row.lineNumber : ''}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    LEVEL_COLOR[row.level] ?? LEVEL_COLOR.DEBUG
                  }`}
                >
                  {row.level}
                </span>
                <span className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-300">
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
