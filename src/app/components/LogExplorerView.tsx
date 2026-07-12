import React, { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { tokenizeLine, eventCssVar } from '../utils/logTokens';
import { computeMatches, type FindState } from '../utils/find';
import { Minimap, type MinimapLine } from './Minimap';
import { Highlighted } from './Highlighted';

interface Props {
  rawLog: string | null;
  find: FindState;
  onMatches: (count: number) => void;
  theme?: string;
  /** 1-based raw-log line to scroll to and highlight (jump from another tab). */
  scrollToLine?: number | null;
}

const ROW_H = 20;

const EVENT_RE = /^\d{2}:\d{2}:\d{2}\.\d+ \(\d+\)\|([A-Z0-9_]+)/;

/** Exact raw log text — verbatim lines, line numbers, color-coded, minimap. */
export const LogExplorerView = ({ rawLog, find, onMatches, theme, scrollToLine }: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => (rawLog ? rawLog.split('\n') : []), [rawLog]);

  const matches = useMemo(
    () => computeMatches(lines, find.query, find.caseSensitive),
    [lines, find.query, find.caseSensitive],
  );

  useEffect(() => {
    onMatches(matches.length);
  }, [matches, onMatches]);

  const minimapLines = useMemo<MinimapLine[]>(
    () =>
      lines.map((line) => {
        const m = line.match(EVENT_RE);
        return {
          offset: m ? 0 : 4,
          length: line.length,
          colorVar: m ? eventCssVar(m[1]!) : '--c-system',
        };
      }),
    [lines],
  );

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 30,
  });

  // Scroll the active match into view.
  const activeLine = matches.length > 0 ? matches[find.index % matches.length]! : -1;
  useEffect(() => {
    if (activeLine >= 0) rowVirtualizer.scrollToIndex(activeLine, { align: 'center' });
    // rowVirtualizer is a new object every render (react-virtual's documented
    // behavior) — including it here would re-scroll on every render instead of
    // only when the active match actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLine]);

  // Scroll to a line jumped to from Execution Tree / Detail Panel.
  useEffect(() => {
    if (!scrollToLine) return;
    const index = scrollToLine - 1;
    if (index >= 0 && index < lines.length) rowVirtualizer.scrollToIndex(index, { align: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above
  }, [scrollToLine, lines.length]);

  const numWidth = String(lines.length).length;

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        No log loaded.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div ref={parentRef} className="min-h-0 min-w-0 flex-1 overflow-auto font-mono text-xs">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const line = lines[vr.index]!;
            const isActive = vr.index === activeLine;
            const isJumped = vr.index + 1 === scrollToLine;
            const hasMatch = find.query && matches.includes(vr.index);
            return (
              <div
                key={vr.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 'max-content',
                  minWidth: '100%',
                  height: vr.size,
                  transform: `translateY(${vr.start}px)`,
                }}
                className={`flex items-center whitespace-pre ${
                  isJumped
                    ? 'bg-debug/15 ring-1 ring-inset ring-ring'
                    : isActive
                      ? 'bg-warn/15'
                      : 'hover:bg-accent/40'
                }`}
              >
                <span
                  className="sticky left-0 shrink-0 select-none border-r border-border bg-background pr-2 text-right text-muted-foreground/80"
                  style={{ minWidth: `${numWidth + 2}ch`, paddingLeft: '0.5ch' }}
                >
                  {vr.index + 1}
                </span>
                <span className="pl-3 pr-6">
                  {tokenizeLine(line).map((token, ti) =>
                    hasMatch ? (
                      <Highlighted
                        key={ti}
                        text={token.text}
                        query={find.query}
                        caseSensitive={find.caseSensitive}
                        active={isActive}
                        className={token.cls}
                      />
                    ) : (
                      <span key={ti} className={token.cls}>
                        {token.text}
                      </span>
                    ),
                  )}
                </span>
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
  );
};
