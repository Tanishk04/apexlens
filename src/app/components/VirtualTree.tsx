import React, { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { computeMatches, type FindState } from '../utils/find';
import { Highlighted } from './Highlighted';
import {
  ChevronRight,
  Database,
  Search,
  Code2,
  AlertTriangle,
  Logs,
  Layers,
  GitBranch,
  Workflow,
  Save,
  Globe,
  ShieldCheck,
  Cog,
  Circle,
  FileText,
} from 'lucide-react';
import type { FlatTreeNode } from '../utils/flattenTree';
import { eventColorFor } from '../theme/eventColors';

interface VirtualTreeProps {
  nodes: FlatTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  /** When set, scroll this row into view (error-first navigation). */
  scrollToId?: string | null;
  /** In-app find state (matches on row names). */
  find?: FindState;
  onMatches?: (count: number) => void;
  /** Jump to this row's raw-log line in Log Explorer. */
  onJumpToLine: (line: number) => void;
}

const TYPE_ICON: Record<string, typeof Database> = {
  CODE_UNIT: Layers,
  METHOD: Code2,
  TRIGGER: Cog,
  FLOW: GitBranch,
  WORKFLOW: Workflow,
  SOQL: Database,
  SOSL: Search,
  DML: Save,
  CALLOUT: Globe,
  VALIDATION: ShieldCheck,
  VF: Layers,
  SYSTEM: Cog,
  DEBUG: Logs,
  EXCEPTION: AlertTriangle,
  GENERIC: Circle,
};

// Tree rows stay low-key for SYSTEM/GENERIC (matches Raw Tree's muted choice).
const MUTED_TEXT_CLASS: Record<string, string> = {
  SYSTEM: 'text-muted-foreground',
  GENERIC: 'text-muted-foreground',
};

function styleFor(type: string) {
  const entry = eventColorFor(type);
  return {
    color: MUTED_TEXT_CLASS[type] ?? entry.textClass,
    badge: entry.badgeClass,
    Icon: TYPE_ICON[type] ?? TYPE_ICON.GENERIC!,
  };
}

export const VirtualTree = ({
  nodes,
  selectedId,
  onSelect,
  onToggle,
  scrollToId,
  find,
  onMatches,
  onJumpToLine,
}: VirtualTreeProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 25,
  });

  useEffect(() => {
    if (!scrollToId) return;
    const index = nodes.findIndex((n) => n.id === scrollToId);
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: 'center' });
    // rowVirtualizer is a new object every render (react-virtual's documented
    // behavior) — including it here would re-scroll on every render instead of
    // only when scrollToId/nodes actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToId, nodes]);

  // In-app find over visible row names.
  const names = useMemo(() => nodes.map((n) => n.name), [nodes]);
  const matches = useMemo(
    () => (find ? computeMatches(names, find.query, find.caseSensitive) : []),
    [names, find],
  );
  useEffect(() => {
    onMatches?.(matches.length);
  }, [matches, onMatches]);

  const activeRow =
    find && matches.length > 0 ? matches[find.index % matches.length]! : -1;
  useEffect(() => {
    if (activeRow >= 0) rowVirtualizer.scrollToIndex(activeRow, { align: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above
  }, [activeRow]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center border-b border-border bg-card/60 py-1 pl-3 pr-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Event</span>
        <div className="ml-auto flex shrink-0 font-mono normal-case">
          <span className="w-12 text-right">SOQL</span>
          <span className="w-12 text-right">DML</span>
          <span className="w-12 text-right">Rows</span>
          <span className="w-16 text-right">Total</span>
          <span className="w-16 text-right">Self</span>
        </div>
      </div>
      <div ref={parentRef} className="min-h-0 w-full flex-1 overflow-auto bg-background">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          minWidth: '100%',
          width: 'max-content',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const node = nodes[virtualRow.index]!;
          const { color, badge, Icon } = styleFor(node.type);
          const isSlow = node.durationMs > 100;
          const isSelected = node.id === selectedId;
          const isException = node.type === 'EXCEPTION';

          return (
            <div
              key={node.id}
              onClick={() => onSelect(node.id)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 'max-content',
                minWidth: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className={`flex cursor-pointer items-center gap-2 border-b border-border/40 pr-3 text-sm ${
                isSelected
                  ? 'bg-debug/15 ring-1 ring-inset ring-ring'
                  : isException
                    ? 'bg-error/10 hover:bg-error/20'
                    : 'hover:bg-accent/60'
              }`}
            >
              {/* indentation */}
              <div className="shrink-0" style={{ width: `${node.depth * 16}px` }} />

              {/* chevron / spacer */}
              {node.expandable ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(node.id);
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={node.collapsed ? 'Expand' : 'Collapse'}
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform ${node.collapsed ? '' : 'rotate-90'}`}
                  />
                </button>
              ) : (
                <div className="w-[22px] shrink-0" />
              )}

              <Icon size={14} className={`shrink-0 ${color}`} />

              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge}`}
              >
                {node.type}
              </span>

              <span
                className={`whitespace-nowrap pr-6 ${
                  node.type === 'SOQL' || node.type === 'SOSL'
                    ? 'font-mono text-xs text-foreground'
                    : 'text-foreground'
                }`}
              >
                {find?.query ? (
                  <Highlighted
                    text={node.name}
                    query={find.query}
                    caseSensitive={find.caseSensitive}
                    active={virtualRow.index === activeRow}
                  />
                ) : (
                  node.name
                )}
              </span>

              {node.lineNumber ? (
                <span
                  className="shrink-0 text-xs text-muted-foreground/70"
                  title="Apex source line"
                >
                  :{node.lineNumber}
                </span>
              ) : null}

              {node.rawLine ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(node.id);
                    onJumpToLine(node.rawLine!);
                  }}
                  title={`Open line ${node.rawLine} in Log Explorer`}
                  className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-debug"
                >
                  <FileText size={12} />
                </button>
              ) : null}

              {/* metric columns (sticky right so they stay visible on h-scroll) */}
              <div className="sticky right-0 ml-auto flex shrink-0 items-center gap-0 bg-background/90 pl-2 font-mono text-xs">
                <Metric value={node.totSoql} className="text-soql" />
                <Metric value={node.totDml} className="text-dml" />
                <Metric value={node.totRows} className="text-muted-foreground" />
                <span className="w-16 text-right text-muted-foreground">
                  {node.durationMs > 0 ? `${node.durationMs}ms` : ''}
                </span>
                <span
                  className={`w-16 rounded text-right ${
                    isSlow ? 'bg-warn/10 px-1 text-warn' : 'text-muted-foreground/70'
                  }`}
                >
                  {node.selfMs > 0 ? `${node.selfMs}ms` : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
};

function Metric({ value, className }: { value: number; className: string }) {
  return (
    <span className={`w-12 text-right ${value > 0 ? className : 'text-transparent'}`}>
      {value > 0 ? value : '·'}
    </span>
  );
}
