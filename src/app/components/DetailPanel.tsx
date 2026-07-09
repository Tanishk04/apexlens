import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { ExecutionNode, StatementEvent, LogException } from '../../types';

interface Props {
  selected: ExecutionNode | StatementEvent | null;
  /** Exception matching the selected row id, if any (shares statement id). */
  exception: LogException | null;
  onClose: () => void;
}

function isExecutionNode(n: ExecutionNode | StatementEvent): n is ExecutionNode {
  return 'children' in n;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="truncate font-mono text-xs text-zinc-300">{value}</div>
    </div>
  );
}

export const DetailPanel = ({ selected, exception, onClose }: Props) => {
  if (!selected) return null;

  const node = isExecutionNode(selected) ? selected : null;
  const stmt = !isExecutionNode(selected) ? selected : null;

  return (
    <div className="flex max-h-56 shrink-0 flex-col border-t border-zinc-800/80 bg-zinc-900/60">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/60 px-4 py-1.5">
        <span className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          {exception ? <AlertTriangle size={13} className="text-red-400" /> : null}
          {node ? node.type : stmt!.type}
          <span className="font-normal text-zinc-500">details</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
        <div className="mb-2 flex flex-wrap gap-x-8 gap-y-2">
          {selected.lineNumber ? <Field label="Line" value={selected.lineNumber} /> : null}
          {node ? (
            <>
              <Field label="Total" value={`${Math.round(node.durationNs / 1e6)} ms`} />
              {node.selfNs != null ? (
                <Field label="Self" value={`${Math.round(node.selfNs / 1e6)} ms`} />
              ) : null}
              {node.totSoql ? <Field label="SOQL" value={node.totSoql} /> : null}
              {node.totDml ? <Field label="DML" value={node.totDml} /> : null}
              {node.soqlRows != null ? <Field label="Rows" value={node.soqlRows} /> : null}
              {node.dmlAction ? <Field label="Operation" value={node.dmlAction} /> : null}
              {node.dmlObject ? <Field label="Object" value={node.dmlObject} /> : null}
              {node.dmlRows != null ? <Field label="DML rows" value={node.dmlRows} /> : null}
              {node.flowDetails?.elementType ? (
                <Field label="Flow element" value={node.flowDetails.elementType} />
              ) : null}
              {node.namespace ? <Field label="Namespace" value={node.namespace} /> : null}
            </>
          ) : null}
          {stmt?.validationResult ? <Field label="Result" value={stmt.validationResult} /> : null}
        </div>

        {node?.unclosed ? (
          <p className="mb-2 inline-block rounded bg-yellow-500/10 px-2 py-1 text-xs text-yellow-500">
            Not closed — log likely truncated.
          </p>
        ) : null}

        <div className="whitespace-pre-wrap break-words rounded-md border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-xs text-zinc-300">
          {node ? node.soql || node.name : stmt!.text}
        </div>

        {exception && exception.stackTrace.length > 0 ? (
          <div className="mt-2 whitespace-pre-wrap break-words rounded-md border border-red-500/20 bg-red-500/5 p-2.5 font-mono text-xs text-red-300/90">
            {exception.stackTrace.join('\n')}
          </div>
        ) : null}
      </div>
    </div>
  );
};
