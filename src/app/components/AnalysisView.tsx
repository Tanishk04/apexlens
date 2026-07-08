import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Analysis, SoqlRow, DmlRow, FlowRow, MethodRow } from '../utils/analysis';
import { VirtualTable, type Column } from './VirtualTable';

interface Props {
  analysis: Analysis;
}

type SubTab = 'soql' | 'dml' | 'flow' | 'execution';

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
      <span className="flex items-center gap-2">
        {r.inLoop ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-400"
            title="Executed multiple times at the same line — likely SOQL in a loop"
          >
            <AlertTriangle size={10} /> loop
          </span>
        ) : null}
        <span className="truncate">{r.query}</span>
      </span>
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

export const AnalysisView = ({ analysis }: Props) => {
  const [tab, setTab] = useState<SubTab>('execution');

  const tabs: { id: SubTab; label: string; count: number }[] = [
    { id: 'execution', label: 'Execution', count: analysis.methods.length },
    { id: 'soql', label: 'SOQL', count: analysis.soql.length },
    { id: 'dml', label: 'DML', count: analysis.dml.length },
    { id: 'flow', label: 'Flow', count: analysis.flow.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800/60 px-3 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
            }`}
          >
            {t.label}
            <span className="rounded bg-zinc-700/50 px-1 text-[10px] text-zinc-400">{t.count}</span>
          </button>
        ))}
        {tab === 'soql' && analysis.soqlInLoopCount > 0 ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-yellow-400">
            <AlertTriangle size={13} />
            {analysis.soqlInLoopCount} quer{analysis.soqlInLoopCount === 1 ? 'y' : 'ies'} in a loop
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'execution' ? (
          <VirtualTable
            columns={methodColumns}
            rows={analysis.methods}
            getKey={(r) => r.type + r.namespace + r.name}
            initialSort="selfMs"
            emptyLabel="No method execution recorded."
          />
        ) : tab === 'soql' ? (
          <VirtualTable
            columns={soqlColumns}
            rows={analysis.soql}
            getKey={(r) => r.query}
            initialSort="totalMs"
            emptyLabel="No SOQL queries in this log."
          />
        ) : tab === 'dml' ? (
          <VirtualTable
            columns={dmlColumns}
            rows={analysis.dml}
            getKey={(r) => r.action + r.object}
            initialSort="totalMs"
            emptyLabel="No DML operations in this log."
          />
        ) : (
          <VirtualTable
            columns={flowColumns}
            rows={analysis.flow}
            getKey={(r) => r.flow + r.element}
            initialSort="count"
            emptyLabel="No Flow execution in this log."
          />
        )}
      </div>
    </div>
  );
};
