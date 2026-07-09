import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';
import type { LogEventLine } from '../../types';

interface Props {
  lines: LogEventLine[];
}

export const RawLogView = ({ lines }: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) => l.event.toLowerCase().includes(q) || l.payload.toLowerCase().includes(q),
    );
  }, [lines, query]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 30,
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search raw log…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtered.length.toLocaleString()} lines
        </span>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const line = filtered[vr.index]!;
            return (
              <div
                key={line.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 'max-content',
                  minWidth: '100%',
                  height: vr.size,
                  transform: `translateY(${vr.start}px)`,
                }}
                className="flex items-center gap-3 whitespace-nowrap px-4 hover:bg-accent/60"
              >
                <span className="shrink-0 text-dml">{line.event}</span>
                {line.lineNumber ? (
                  <span className="shrink-0 text-muted-foreground/70">[{line.lineNumber}]</span>
                ) : null}
                <span className="text-muted-foreground">{line.payload}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
