import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Database, Code2, AlertTriangle, Bug, Layers } from 'lucide-react';
import type { FlatTreeNode } from '../utils/flattenTree';

interface VirtualTreeProps {
  nodes: FlatTreeNode[];
}

function NodeIcon({ type }: { type: string }) {
  if (type === 'SOQL') return <Database size={14} className="shrink-0 text-green-500" />;
  if (type === 'EXCEPTION') return <AlertTriangle size={14} className="shrink-0 text-red-500" />;
  if (type === 'DEBUG') return <Bug size={14} className="shrink-0 text-blue-400" />;
  if (type === 'CODE_UNIT') return <Layers size={14} className="shrink-0 text-amber-400" />;
  return <Code2 size={14} className="shrink-0 text-purple-500" />;
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case 'SOQL':
      return 'bg-green-500/10 text-green-400';
    case 'METHOD':
      return 'bg-purple-500/10 text-purple-400';
    case 'CODE_UNIT':
      return 'bg-amber-500/10 text-amber-400';
    case 'EXCEPTION':
      return 'bg-red-500/10 text-red-400';
    case 'DEBUG':
      return 'bg-blue-500/10 text-blue-400';
    default:
      return 'bg-zinc-800 text-zinc-400';
  }
}

export const VirtualTree = ({ nodes }: VirtualTreeProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
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
          const node = nodes[virtualRow.index];
          const isSOQL = node.type === 'SOQL';
          const isSlow = node.durationMs > 100;

          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 'max-content',
                minWidth: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="flex items-center gap-2 border-b border-zinc-900 px-3 text-sm hover:bg-zinc-900/40"
            >
              <div className="shrink-0" style={{ width: `${node.depth * 20}px` }} />

              <div className="shrink-0">
                <NodeIcon type={node.type} />
              </div>

              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadgeClass(node.type)}`}
              >
                {node.type}
              </span>

              <span
                className={`whitespace-nowrap pr-6 ${isSOQL ? 'font-mono text-xs text-zinc-300' : 'text-zinc-200'}`}
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
