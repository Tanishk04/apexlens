import React from 'react';
import { X, AlertTriangle, FileText } from 'lucide-react';
import type { ExecutionNode, StatementEvent, LogException } from '../../types';

interface Props {
  selected: ExecutionNode | StatementEvent | null;
  /** Exception matching the selected row id, if any (shares statement id). */
  exception: LogException | null;
  onClose: () => void;
  /** Jump to the selected row's raw-log line in Log Explorer. */
  onJumpToLine: (line: number) => void;
}

function isExecutionNode(n: ExecutionNode | StatementEvent): n is ExecutionNode {
  return 'children' in n;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-xs text-foreground">{value}</div>
    </div>
  );
}

export const DetailPanel = ({ selected, exception, onClose, onJumpToLine }: Props) => {
  if (!selected) return null;

  const node = isExecutionNode(selected) ? selected : null;
  const stmt = !isExecutionNode(selected) ? selected : null;

  return (
    <div className="flex max-h-56 shrink-0 flex-col border-t border-border bg-card/60">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-1.5">
        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
          {exception ? <AlertTriangle size={13} className="text-error" /> : null}
          {node ? node.type : stmt!.type}
          <span className="font-normal text-muted-foreground">details</span>
        </span>
        <div className="flex items-center gap-2">
          {selected.rawLine ? (
            <button
              type="button"
              onClick={() => onJumpToLine(selected.rawLine)}
              title={`Open line ${selected.rawLine} in Log Explorer`}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-debug hover:text-debug"
            >
              <FileText size={12} /> Open in Log Explorer
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
        <div className="mb-2 flex flex-wrap gap-x-8 gap-y-2">
          {selected.lineNumber ? <Field label="Apex line" value={selected.lineNumber} /> : null}
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
          <p className="mb-2 inline-block rounded bg-warn/10 px-2 py-1 text-xs text-warn">
            Not closed — log likely truncated.
          </p>
        ) : null}

        <div className="whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2.5 font-mono text-xs text-foreground">
          {node ? node.soql || node.name : stmt!.text}
        </div>

        {exception && exception.stackTrace.length > 0 ? (
          <div className="mt-2 whitespace-pre-wrap break-words rounded-md border border-error/30 bg-error/10 p-2.5 font-mono text-xs text-error/80">
            {exception.stackTrace.join('\n')}
          </div>
        ) : null}
      </div>
    </div>
  );
};
