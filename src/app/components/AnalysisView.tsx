import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileText } from 'lucide-react';
import type { Analysis, SoqlRow, DmlRow, FlowRow, MethodRow } from '../utils/analysis';
import { VirtualTable, type Column } from './VirtualTable';

interface Props {
  analysis: Analysis;
}

interface SoqlProps extends Props {
  /** Jump to a SOQL row's first occurrence in Log Explorer (see App.tsx's jumpToLine). */
  onJumpToLine?: (line: number) => void;
}

function fmtMs(ms: number): string {
  if (ms >= 10) return Math.round(ms).toString();
  return ms.toFixed(1);
}

/**
 * A SOQL-in-a-loop row's single jump icon only ever went to the first
 * occurrence — the other N-1 runs of that same query were unreachable from
 * this table at all. Renders a small menu of every raw-log line instead,
 * portalled to `document.body` rather than positioned in place: this cell
 * lives inside a `VirtualTable` row, and every row is `transform:
 * translateY(...)`-positioned for virtualization — a descendant `position:
 * fixed` element would be fixed *to that transformed row*, not the
 * viewport (the same containing-block gotcha that broke `position: sticky`
 * in the Execution Tree earlier). A portal sidesteps it by rendering
 * outside the transformed subtree entirely, same fix shape as the content
 * script's ⓘ popover.
 */
function OccurrenceMenu({
  lines,
  onJump,
}: {
  lines: number[];
  onJump: (line: number) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuWidth = 150;

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    // Anything that could invalidate the fixed-position coordinates —
    // scrolling the table, resizing the window — closes the menu rather
    // than tracking it live, same as the ⓘ popover.
    document.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (pos) {
            setPos(null);
            return;
          }
          const rect = btnRef.current!.getBoundingClientRect();
          setPos({
            top: rect.bottom + 4,
            left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
          });
        }}
        title={`${lines.length} occurrences — click to pick one`}
        className="rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-debug"
      >
        <FileText size={12} />
      </button>
      {pos
        ? createPortal(
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: menuWidth }}
              className="z-50 max-h-56 overflow-y-auto rounded-md border border-border bg-card py-1 text-xs shadow-lg"
            >
              {lines.map((line, i) => (
                <button
                  key={`${line}-${i}`}
                  type="button"
                  onClick={() => {
                    onJump(line);
                    setPos(null);
                  }}
                  className="block w-full px-3 py-1 text-left font-mono text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  #{i + 1} · line {line}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Built per-render (not a module constant like the other analysis columns)
 * because the jump-to-line action needs `onJumpToLine` from App.tsx — a plain
 * constant array can't close over a prop.
 */
function buildSoqlColumns(onJumpToLine?: (line: number) => void): Column<SoqlRow>[] {
  return [
    {
      key: 'query',
      header: 'Query',
      get: (r) => r.query,
      grow: true,
      mono: true,
      filter: true,
      render: (r) => (
        <>
          {r.inLoop ? (
            <span
              className="mr-2 inline-flex shrink-0 items-center gap-1 rounded bg-warn/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase text-validation"
              title="Executed multiple times at the same line — likely SOQL in a loop"
            >
              <AlertTriangle size={10} /> loop
            </span>
          ) : null}
          {r.query}
        </>
      ),
    },
    { key: 'count', header: 'Count', get: (r) => r.count, align: 'right', mono: true, width: 'w-20' },
    {
      key: 'totalMs',
      header: 'Time (ms)',
      get: (r) => r.totalMs,
      align: 'right',
      mono: true,
      width: 'w-24',
      render: (r) => fmtMs(r.totalMs),
    },
    {
      key: 'totalRows',
      header: 'Rows',
      get: (r) => r.totalRows,
      align: 'right',
      mono: true,
      width: 'w-20',
    },
    {
      key: 'maxRows',
      header: 'Max rows',
      get: (r) => r.maxRows,
      align: 'right',
      mono: true,
      width: 'w-24',
    },
    {
      key: 'jump',
      header: '',
      get: () => '',
      align: 'right',
      width: 'w-8',
      render: (r) => {
        const line = r.rawLines[0];
        if (!onJumpToLine || !line) return null;
        if (r.rawLines.length > 1) {
          return <OccurrenceMenu lines={r.rawLines} onJump={onJumpToLine} />;
        }
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onJumpToLine(line);
            }}
            title={`Open line ${line} in Log Explorer`}
            className="rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-debug"
          >
            <FileText size={12} />
          </button>
        );
      },
    },
  ];
}

const dmlColumns: Column<DmlRow>[] = [
  { key: 'action', header: 'Operation', get: (r) => r.action, width: 'w-28' },
  { key: 'object', header: 'Object', get: (r) => r.object, grow: true, mono: true },
  { key: 'count', header: 'Count', get: (r) => r.count, align: 'right', mono: true, width: 'w-20' },
  {
    key: 'totalRows',
    header: 'Rows',
    get: (r) => r.totalRows,
    align: 'right',
    mono: true,
    width: 'w-24',
  },
  {
    key: 'totalMs',
    header: 'Time (ms)',
    get: (r) => r.totalMs,
    align: 'right',
    mono: true,
    width: 'w-24',
    render: (r) => fmtMs(r.totalMs),
  },
];

const flowColumns: Column<FlowRow>[] = [
  { key: 'element', header: 'Element', get: (r) => r.element, grow: true, mono: true },
  { key: 'flow', header: 'Flow', get: (r) => r.flow, width: 'w-40' },
  { key: 'count', header: 'Count', get: (r) => r.count, align: 'right', mono: true, width: 'w-20' },
  {
    key: 'totalMs',
    header: 'Time (ms)',
    get: (r) => r.totalMs,
    align: 'right',
    mono: true,
    width: 'w-24',
    render: (r) => fmtMs(r.totalMs),
  },
];

const methodColumns: Column<MethodRow>[] = [
  { key: 'name', header: 'Name', get: (r) => r.name, grow: true, mono: true, filter: true },
  { key: 'type', header: 'Type', get: (r) => r.type, width: 'w-28', filter: true },
  { key: 'count', header: 'Count', get: (r) => r.count, align: 'right', mono: true, width: 'w-20' },
  {
    key: 'totalMs',
    header: 'Total (ms)',
    get: (r) => r.totalMs,
    align: 'right',
    mono: true,
    width: 'w-24',
    render: (r) => fmtMs(r.totalMs),
  },
  {
    key: 'selfMs',
    header: 'Self (ms)',
    get: (r) => r.selfMs,
    align: 'right',
    mono: true,
    width: 'w-24',
    render: (r) => fmtMs(r.selfMs),
  },
];

// Each analysis is now its own top-level tab (matches Log Inspector).

export const ExecutionAnalysis = ({ analysis }: Props) => (
  <VirtualTable
    columns={methodColumns}
    rows={analysis.methods}
    getKey={(r) => r.type + r.namespace + r.name}
    initialSort="selfMs"
    emptyLabel="No method execution recorded."
  />
);

export const SoqlAnalysis = ({ analysis, onJumpToLine }: SoqlProps) => {
  const columns = useMemo(() => buildSoqlColumns(onJumpToLine), [onJumpToLine]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {analysis.soqlInLoopCount > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-warn/10 px-4 py-1.5 text-xs text-validation">
          <AlertTriangle size={13} />
          {analysis.soqlInLoopCount} quer{analysis.soqlInLoopCount === 1 ? 'y' : 'ies'} executed in a
          loop
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <VirtualTable
          columns={columns}
          rows={analysis.soql}
          getKey={(r) => r.query}
          initialSort="totalMs"
          emptyLabel="No SOQL queries in this log."
        />
      </div>
    </div>
  );
};

export const DmlAnalysis = ({ analysis }: Props) => (
  <VirtualTable
    columns={dmlColumns}
    rows={analysis.dml}
    getKey={(r) => r.action + r.object}
    initialSort="totalMs"
    emptyLabel="No DML operations in this log."
  />
);

export const FlowAnalysis = ({ analysis }: Props) => (
  <VirtualTable
    columns={flowColumns}
    rows={analysis.flow}
    getKey={(r) => r.flow + r.element}
    initialSort="count"
    emptyLabel="No Flow execution in this log."
  />
);
