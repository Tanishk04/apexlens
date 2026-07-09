import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  /** Value used for sorting (and default rendering). */
  get: (row: T) => string | number;
  /** Optional custom cell renderer. */
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
  /** Flex-basis width, e.g. 'flex-1', 'w-24'. Defaults to 'flex-1'. */
  width?: string;
  grow?: boolean;
}

interface VirtualTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T, index: number) => string;
  /** Initial sort column key; defaults to first column. */
  initialSort?: string;
  initialDir?: 'asc' | 'desc';
  emptyLabel?: string;
}

export function VirtualTable<T>({
  columns,
  rows,
  getKey,
  initialSort,
  initialDir = 'desc',
  emptyLabel = 'No data.',
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState(initialSort ?? columns[0]!.key);
  const [dir, setDir] = useState<'asc' | 'desc'>(initialDir);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const factor = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [rows, columns, sortKey, dir]);

  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 20,
  });

  function toggleSort(key: string) {
    if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setDir('desc');
    }
  }

  function cellClass(col: Column<T>): string {
    return [
      col.width ?? 'flex-1',
      col.grow ? 'min-w-[8rem]' : '',
      col.align === 'right' ? 'text-right justify-end' : 'text-left',
      col.mono ? 'font-mono' : '',
    ].join(' ');
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
            onClick={() => toggleSort(col.key)}
            className={`flex items-center gap-1 hover:text-foreground ${cellClass(col)}`}
          >
            <span className="truncate">{col.header}</span>
            {sortKey === col.key ? (
              dir === 'asc' ? (
                <ChevronUp size={12} className="shrink-0" />
              ) : (
                <ChevronDown size={12} className="shrink-0" />
              )
            ) : null}
          </button>
        ))}
      </div>

      {/* body */}
      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground/70">
          {emptyLabel}
        </div>
      ) : (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const row = sorted[vr.index]!;
              return (
                <div
                  key={getKey(row, vr.index)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: vr.size,
                    transform: `translateY(${vr.start}px)`,
                  }}
                  className="flex items-center gap-3 border-b border-border/40 px-4 text-sm text-foreground hover:bg-accent/60"
                >
                  {columns.map((col) => (
                    <div
                      key={col.key}
                      className={`flex items-center overflow-hidden whitespace-nowrap ${cellClass(col)}`}
                    >
                      <span className="truncate">{col.render ? col.render(row) : col.get(row)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
