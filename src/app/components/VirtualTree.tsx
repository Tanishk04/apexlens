import React, { useRef } from 'react';
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
}

const TYPE_STYLE: Record<string, { color: string; badge: string; Icon: typeof Database }> = {
  CODE_UNIT: { color: 'text-amber-400', badge: 'bg-amber-500/10 text-amber-400', Icon: Layers },
  METHOD: { color: 'text-purple-400', badge: 'bg-purple-500/10 text-purple-400', Icon: Code2 },
  TRIGGER: { color: 'text-orange-400', badge: 'bg-orange-500/10 text-orange-400', Icon: Cog },
  FLOW: { color: 'text-cyan-400', badge: 'bg-cyan-500/10 text-cyan-400', Icon: GitBranch },
  WORKFLOW: { color: 'text-teal-400', badge: 'bg-teal-500/10 text-teal-400', Icon: Workflow },
  SOQL: { color: 'text-green-400', badge: 'bg-green-500/10 text-green-400', Icon: Database },
  SOSL: { color: 'text-green-400', badge: 'bg-green-500/10 text-green-400', Icon: Search },
  DML: { color: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400', Icon: Save },
  CALLOUT: { color: 'text-sky-400', badge: 'bg-sky-500/10 text-sky-400', Icon: Globe },
  VALIDATION: {
    color: 'text-yellow-400',
    badge: 'bg-yellow-500/10 text-yellow-400',
    Icon: ShieldCheck,
  },
  VF: { color: 'text-pink-400', badge: 'bg-pink-500/10 text-pink-400', Icon: Layers },
  SYSTEM: { color: 'text-zinc-400', badge: 'bg-zinc-700/40 text-zinc-300', Icon: Cog },
  DEBUG: { color: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-400', Icon: Bug },
  EXCEPTION: { color: 'text-red-400', badge: 'bg-red-500/10 text-red-400', Icon: AlertTriangle },
  GENERIC: { color: 'text-zinc-500', badge: 'bg-zinc-800 text-zinc-400', Icon: Circle },
};

function styleFor(type: string) {
  return TYPE_STYLE[type] ?? TYPE_STYLE.GENERIC!;
}

export const VirtualTree = ({ nodes, selectedId, onSelect, onToggle }: VirtualTreeProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 25,
  });

  return (
    <div ref={parentRef} className="h-full min-h-0 w-full overflow-auto bg-zinc-950">
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
              className={`flex cursor-pointer items-center gap-2 border-b border-zinc-900 pr-3 text-sm ${
                isSelected
                  ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/40'
                  : isException
                    ? 'bg-red-500/5 hover:bg-red-500/10'
                    : 'hover:bg-zinc-900/50'
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
                  className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
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
                    ? 'font-mono text-xs text-zinc-300'
                    : 'text-zinc-200'
                }`}
              >
                {node.name}
              </span>

              {node.lineNumber ? (
                <span className="shrink-0 text-xs text-zinc-600">:{node.lineNumber}</span>
              ) : null}

              {node.durationMs > 0 ? (
                <span
                  className={`ml-auto shrink-0 rounded px-1.5 font-mono text-xs ${
                    isSlow ? 'bg-yellow-500/10 text-yellow-500' : 'text-zinc-500'
                  }`}
                >
                  {node.durationMs}ms
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
