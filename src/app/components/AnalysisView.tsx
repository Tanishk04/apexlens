import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Analysis, SoqlRow, DmlRow, FlowRow, MethodRow } from '../utils/analysis';
import { VirtualTable, type Column } from './VirtualTable';

interface Props {
  analysis: Analysis;
}

function fmtMs(ms: number): string {
  if (ms >= 10) return Math.round(ms).toString();
  return ms.toFixed(1);
}

const soqlColumns: Column<SoqlRow>[] = [
  {
    key: 'query',
    header: 'Query',
    get: (r) => r.query,
    grow: true,
    mono: true,
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
];

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
  { key: 'name', header: 'Name', get: (r) => r.name, grow: true, mono: true },
  { key: 'type', header: 'Type', get: (r) => r.type, width: 'w-28' },
  { key: 'namespace', header: 'Namespace', get: (r) => r.namespace, width: 'w-28' },
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

export const SoqlAnalysis = ({ analysis }: Props) => (
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
        columns={soqlColumns}
        rows={analysis.soql}
        getKey={(r) => r.query}
        initialSort="totalMs"
        emptyLabel="No SOQL queries in this log."
      />
    </div>
  </div>
);

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
