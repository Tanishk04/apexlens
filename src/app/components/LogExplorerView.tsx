import React, { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { tokenizeLine, eventClass } from '../utils/logTokens';
import { computeMatches, splitByMatch, type FindState } from '../utils/find';
import { Minimap, type MinimapLine } from './Minimap';

interface Props {
  rawLog: string | null;
  find: FindState;
  onMatches: (count: number) => void;
  theme?: string;
}

const ROW_H = 20;

const EVENT_RE = /^\d{2}:\d{2}:\d{2}\.\d+ \(\d+\)\|([A-Z0-9_]+)/;

const CLS_TO_VAR: Record<string, string> = {
  'text-soql': '--c-soql',
  'text-dml': '--c-dml',
  'text-callout': '--c-callout',
  'text-flow': '--c-flow',
  'text-workflow': '--c-workflow',
  'text-validation': '--c-validation',
  'text-vf': '--c-vf',
  'text-method': '--c-method',
  'text-code-unit': '--c-code-unit',
  'text-error': '--c-error',
  'text-debug': '--c-debug',
  'text-system': '--c-system',
};

/** Exact raw log text — verbatim lines, line numbers, color-coded, minimap. */
export const LogExplorerView = ({ rawLog, find, onMatches, theme }: Props) => {
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
        const cls = m ? eventClass(m[1]!) : 'text-system';
        return {
          offset: m ? 0 : 4,
          length: line.length,
          colorVar: CLS_TO_VAR[cls] ?? '--c-system',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLine]);

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
                  isActive ? 'bg-warn/15' : 'hover:bg-accent/40'
                }`}
              >
                <span
                  className="sticky left-0 shrink-0 select-none border-r border-border bg-background pr-2 text-right text-muted-foreground/60"
                  style={{ minWidth: `${numWidth + 2}ch`, paddingLeft: '0.5ch' }}
                >
                  {vr.index + 1}
                </span>
                <span className="pl-3 pr-6">
                  {tokenizeLine(line).map((token, ti) =>
                    hasMatch ? (
                      splitByMatch(token.text, find.query, find.caseSensitive).map((seg, si) =>
                        seg.match ? (
                          <mark
                            key={`${ti}-${si}`}
                            className={`rounded-sm px-0 ${
                              isActive ? 'bg-warn text-background' : 'bg-warn/40 text-foreground'
                            }`}
                          >
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={`${ti}-${si}`} className={token.cls}>
                            {seg.text}
                          </span>
                        ),
                      )
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
