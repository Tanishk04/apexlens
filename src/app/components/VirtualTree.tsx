import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Check,
  X,
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

/**
 * The chevron column, shared by the expand button and the leaf spacer.
 *
 * These must be byte-identical, not merely similar. They were previously sized
 * independently — the button from `p-0.5` around a 14px icon, the spacer from a
 * literal `w-[22px]` — and since `index.css` sets a 13px root font size, the
 * rem-derived padding computed to 1.625px rather than 2px. The button came out
 * 17.3px against the spacer's 22px, so any leaf row sat ~5px right of a
 * sibling with children. Fixed size plus centring removes the arithmetic
 * entirely and survives a change to the root font size.
 */
const CHEVRON_SLOT = 'flex h-[18px] w-[18px] shrink-0 items-center justify-center';

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
    description: entry.description,
  };
}

let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Widest a row's scrollable text (name + optional ":line") can get, in px, so
 * the shared scrollbar strip below the list has somewhere real to scroll to.
 * Approximate on purpose — it only sizes a scroll track, not layout.
 */
function measureMaxRowWidth(nodes: FlatTreeNode[]): number {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) return 0;
  measureCtx.font = '13px ui-monospace, monospace';
  let max = 0;
  for (const node of nodes) {
    let text = node.name;
    if (node.lineNumber) text += ` :${node.lineNumber}`;
    const width = measureCtx.measureText(text).width;
    if (width > max) max = width;
  }
  return Math.ceil(max) + 24; // slack for the jump-icon button
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
  const stripRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // One shared horizontal scroll position for every row's name/query text —
  // driven by a single strip at the bottom, not one native scrollbar per row.
  const [scrollX, setScrollX] = useState(0);
  const maxRowWidth = useMemo(() => measureMaxRowWidth(nodes), [nodes]);

  const handleStripScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollX(left));
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // A filter/collapse change can shrink the widest row out from under the
  // current scroll offset; snap back rather than leave rows translated past
  // content that no longer exists.
  useEffect(() => {
    setScrollX(0);
    if (stripRef.current) stripRef.current.scrollLeft = 0;
  }, [nodes]);

  // Forward horizontal wheel/trackpad gestures over the rows themselves to
  // the strip, instead of requiring the user to grab the thin scrollbar at
  // the bottom of the panel. A native (non-React) listener, since it must
  // call preventDefault to stop the browser also scrolling the page — React's
  // onWheel is passive by default and preventDefault there is a silent no-op.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const strip = stripRef.current;
      if (!strip) return;
      const delta = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (delta === 0) return;
      e.preventDefault();
      strip.scrollLeft += delta;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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
      {/*
        Header: fixed "Event" label + fixed metric headers, same flex layout as
        every row below — not synced-by-numbers with them, governed by the
        identical structure. `sticky top-0` alone (no `sticky right-0`: nothing
        in this header scrolls horizontally, so there's nothing to pin).
      */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-border bg-card py-1 pl-3 pr-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="min-w-0 flex-1">Event</span>
        <div className="flex shrink-0 items-center gap-0 font-mono normal-case">
          <span className="w-12 text-right">SOQL</span>
          <span className="w-12 text-right">DML</span>
          <span className="w-12 text-right">Rows</span>
          <span className="w-16 text-right">Total</span>
          <span className="w-16 text-right">Self</span>
        </div>
      </div>
      <div ref={parentRef} className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden bg-background">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const node = nodes[virtualRow.index]!;
          const { color, badge, Icon, description } = styleFor(node.type);
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
                width: '100%',
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

              {/* chevron / spacer — both branches use CHEVRON_SLOT so a row with
                  children and a leaf row at the same depth line up exactly. */}
              {node.expandable ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(node.id);
                  }}
                  className={`${CHEVRON_SLOT} rounded text-muted-foreground hover:bg-accent hover:text-foreground`}
                  aria-label={node.collapsed ? 'Expand' : 'Collapse'}
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform ${node.collapsed ? '' : 'rotate-90'}`}
                  />
                </button>
              ) : (
                <div className={CHEVRON_SLOT} />
              )}

              <Icon size={14} className={`shrink-0 ${color}`} />

              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge}`}
                title={description}
              >
                {node.type}
              </span>

              {node.validationResult ? (
                <span
                  className={`flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    node.validationResult === 'PASS'
                      ? 'bg-soql/15 text-soql'
                      : 'bg-error/15 text-error'
                  }`}
                >
                  {/*
                    Shape, not just color, carries PASS vs FAIL — a
                    checkmark vs an X survive red-green color blindness,
                    where the green/red badge backgrounds alone can read as
                    near-identical.
                  */}
                  {node.validationResult === 'PASS' ? (
                    <Check size={10} strokeWidth={3} />
                  ) : (
                    <X size={10} strokeWidth={3} />
                  )}
                  {node.validationResult}
                </span>
              ) : null}

              {/*
                The ONLY horizontally-movable part of the row, and all rows
                move together: `overflow-hidden` here (no native per-row
                scrollbar) plus a `translateX` driven by one shared `scrollX`
                value, controlled by a single strip below the list — not one
                independent scrollbar per row. Line number and jump-icon sit
                in the static trailing group below, not in here.
              */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div
                  className="flex w-max items-center gap-1.5"
                  style={{ transform: `translateX(-${scrollX}px)` }}
                >
                  <span
                    className={`whitespace-nowrap ${
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
                </div>
              </div>

              {/* Static trailing group: never inside the moving box above,
                  so none of it can drift, dim, or show scrolled text through it. */}
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

              <div className="flex shrink-0 items-center gap-0 pl-2 font-mono text-xs">
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

      {/*
        The single control for horizontal scroll — every row's name/query
        text moves together in lockstep, rather than each row owning its own
        independent scrollbar. A thin native `overflow-x-auto` strip is the
        scroll input; its inner spacer is just sized to the widest row so the
        browser gives it a real scrollbar and scroll physics for free. `scrollX`
        (read from this strip's `onScroll`) is applied as `translateX` to
        every visible row above.
      */}
      {maxRowWidth > 0 ? (
        <div
          ref={stripRef}
          onScroll={handleStripScroll}
          className="h-2.5 shrink-0 overflow-x-auto overflow-y-hidden border-t border-border"
          title="Scroll to read long lines"
        >
          <div style={{ width: `${maxRowWidth}px`, height: 1 }} />
        </div>
      ) : null}
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
