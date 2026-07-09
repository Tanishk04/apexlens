import React, { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronRight,
  Database,
  Search,
  Code2,
  AlertTriangle,
  Bug,
  Layers,
  GitBranch,
  Workflow,
  Save,
  Globe,
  ShieldCheck,
  Cog,
  Circle,
} from 'lucide-react';
import type { FlatTreeNode } from '../utils/flattenTree';

interface VirtualTreeProps {
  nodes: FlatTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  /** When set, scroll this row into view (error-first navigation). */
  scrollToId?: string | null;
}

const TYPE_STYLE: Record<string, { color: string; badge: string; Icon: typeof Database }> = {
  CODE_UNIT: { color: 'text-code-unit', badge: 'bg-code-unit/15 text-code-unit', Icon: Layers },
  METHOD: { color: 'text-method', badge: 'bg-method/15 text-method', Icon: Code2 },
  TRIGGER: { color: 'text-trigger', badge: 'bg-trigger/15 text-trigger', Icon: Cog },
  FLOW: { color: 'text-flow', badge: 'bg-flow/15 text-flow', Icon: GitBranch },
  WORKFLOW: { color: 'text-workflow', badge: 'bg-workflow/15 text-workflow', Icon: Workflow },
  SOQL: { color: 'text-soql', badge: 'bg-soql/15 text-soql', Icon: Database },
  SOSL: { color: 'text-soql', badge: 'bg-soql/15 text-soql', Icon: Search },
  DML: { color: 'text-dml', badge: 'bg-dml/15 text-dml', Icon: Save },
  CALLOUT: { color: 'text-callout', badge: 'bg-callout/15 text-callout', Icon: Globe },
  VALIDATION: {
    color: 'text-validation',
    badge: 'bg-warn/10 text-validation',
    Icon: ShieldCheck,
  },
  VF: { color: 'text-vf', badge: 'bg-vf/15 text-vf', Icon: Layers },
  SYSTEM: { color: 'text-muted-foreground', badge: 'bg-muted text-foreground', Icon: Cog },
  DEBUG: { color: 'text-debug', badge: 'bg-debug/15 text-debug', Icon: Bug },
  EXCEPTION: { color: 'text-error', badge: 'bg-error/10 text-error', Icon: AlertTriangle },
  GENERIC: { color: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground', Icon: Circle },
};

function styleFor(type: string) {
  return TYPE_STYLE[type] ?? TYPE_STYLE.GENERIC!;
}

export const VirtualTree = ({
  nodes,
  selectedId,
  onSelect,
  onToggle,
  scrollToId,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToId, nodes]);

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
                {node.name}
              </span>

              {node.lineNumber ? (
                <span className="shrink-0 text-xs text-muted-foreground/70">:{node.lineNumber}</span>
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
