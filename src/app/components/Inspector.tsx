import React from 'react';
import { AlertTriangle, Sparkles, ChevronRight } from 'lucide-react';
import type { ExecutionNode, StatementEvent, LogException } from '../../types';

interface InspectorProps {
  selected: ExecutionNode | StatementEvent | null;
  exceptions: LogException[];
  onSelectException: (id: string) => void;
}

function isExecutionNode(n: ExecutionNode | StatementEvent): n is ExecutionNode {
  return 'children' in n;
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className={mono ? 'font-mono text-zinc-300' : 'text-zinc-300'}>{value}</span>
    </div>
  );
}

export const Inspector = ({ selected, exceptions, onSelectException }: InspectorProps) => {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800/60 bg-zinc-950">
      <header className="flex h-12 shrink-0 items-center border-b border-zinc-800/60 bg-zinc-900/50 px-4">
        <h2 className="text-sm font-medium">Inspector</h2>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* Exception center (error-first) */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Exceptions ({exceptions.length})
          </h3>
          {exceptions.length === 0 ? (
            <p className="text-sm text-zinc-600">No exceptions detected.</p>
          ) : (
            <ul className="space-y-1">
              {exceptions.map((ex) => (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => onSelectException(ex.id)}
                    className="flex w-full items-start gap-2 rounded-md bg-red-500/5 px-2 py-1.5 text-left hover:bg-red-500/10"
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-red-400">
                        {ex.exceptionType}
                      </span>
                      <span className="block truncate text-[11px] text-red-400/70">
                        {ex.message}
                      </span>
                    </span>
                    <ChevronRight size={13} className="ml-auto mt-0.5 shrink-0 text-red-400/50" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="h-px w-full bg-zinc-800/60" />

        {/* Selected node details */}
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Selected event
          </h3>
          {!selected ? (
            <p className="text-sm text-zinc-600">Select an event to inspect details.</p>
          ) : isExecutionNode(selected) ? (
            <div className="space-y-2 text-sm">
              <Row label="Type" value={selected.type} />
              {selected.lineNumber ? <Row label="Line" value={selected.lineNumber} mono /> : null}
              <Row label="Duration" value={`${Math.round(selected.durationNs / 1e6)} ms`} mono />
              {selected.soqlRows != null ? <Row label="Rows" value={selected.soqlRows} mono /> : null}
              {selected.dmlAction ? <Row label="Operation" value={selected.dmlAction} /> : null}
              {selected.dmlObject ? <Row label="Object" value={selected.dmlObject} /> : null}
              {selected.dmlRows != null ? (
                <Row label="DML rows" value={selected.dmlRows} mono />
              ) : null}
              {selected.flowDetails?.elementType ? (
                <Row label="Flow element" value={selected.flowDetails.elementType} />
              ) : null}
              {selected.unclosed ? (
                <p className="rounded bg-yellow-500/10 px-2 py-1 text-xs text-yellow-500">
                  Not closed — log likely truncated.
                </p>
              ) : null}
              <div className="whitespace-pre-wrap break-words rounded-md border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-300">
                {selected.soql || selected.name}
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Type" value={selected.type} />
              {selected.lineNumber ? <Row label="Line" value={selected.lineNumber} mono /> : null}
              {selected.validationResult ? (
                <Row label="Result" value={selected.validationResult} />
              ) : null}
              {selected.type === 'EXCEPTION' ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
                  title="AI diagnosis (coming soon)"
                >
                  <Sparkles size={16} className="text-blue-600" />
                  Explain with AI
                </button>
              ) : null}
              <div className="whitespace-pre-wrap break-words rounded-md border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-300">
                {selected.text}
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
