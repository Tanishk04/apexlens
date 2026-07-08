import React from 'react';
import { AlertTriangle, Sparkles, Code2 } from 'lucide-react';
import type { LogException } from '../../types';
import type { FlatTreeNode } from '../utils/flattenTree';

interface InspectorProps {
  exception: LogException | null;
  selectedNode: FlatTreeNode | null;
}

export const Inspector = ({ exception, selectedNode }: InspectorProps) => {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800/60 bg-zinc-950">
      <header className="flex h-12 shrink-0 items-center border-b border-zinc-800/60 bg-zinc-900/50 px-4">
        <h2 className="text-sm font-medium">Inspector</h2>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {exception ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-red-400">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-red-500">{exception.exceptionType}</h3>
                <p className="mt-1 text-xs text-red-400/80">{exception.message}</p>
              </div>
            </div>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
            >
              <Sparkles size={16} className="text-blue-600" />
              Explain with AI
            </button>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No exceptions detected in this log.</div>
        )}

        <div className="h-px w-full bg-zinc-800/60" />

        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Selected Event</h3>
          {selectedNode ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-zinc-500">Type</span>
                <span className="flex items-center gap-1.5 text-purple-400">
                  <Code2 size={14} />
                  {selectedNode.type}
                </span>
              </div>
              {selectedNode.lineNumber ? (
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-500">Line</span>
                  <span className="font-mono text-zinc-300">{selectedNode.lineNumber}</span>
                </div>
              ) : null}
              {selectedNode.durationMs > 0 ? (
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-500">Duration</span>
                  <span className="font-mono text-zinc-300">{selectedNode.durationMs}ms</span>
                </div>
              ) : null}
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-300 break-words">
                {selectedNode.name}
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Select a log event to inspect details.</div>
          )}
        </div>
      </div>
    </aside>
  );
};
