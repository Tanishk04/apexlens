import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { VirtualTree } from './components/VirtualTree';
import { FilterBar } from './components/FilterBar';
import { Inspector } from './components/Inspector';
import { TabBar, type MainTab } from './components/TabBar';
import { GovernorDashboard } from './components/GovernorDashboard';
import { AnalysisView } from './components/AnalysisView';
import { RawLogView } from './components/RawLogView';
import { Timeline } from './components/Timeline';
import { analyze } from './utils/analysis';
import {
  flattenEventLines,
  flattenExecutionTree,
  indexTree,
  collectExpandableIds,
} from './utils/flattenTree';
import { getSessionId, fetchLogBody } from '../api/salesforce';
import { parseLogInWorker } from './utils/parseInWorker';
import { SAMPLE_LOG } from './sampleLog';
import type { ParsedDebugLog } from '../types';
import '../index.css';

// Preferred order for the filter chips.
const TYPE_ORDER = [
  'CODE_UNIT',
  'TRIGGER',
  'METHOD',
  'FLOW',
  'WORKFLOW',
  'SOQL',
  'SOSL',
  'DML',
  'CALLOUT',
  'VALIDATION',
  'VF',
  'DEBUG',
  'EXCEPTION',
  'SYSTEM',
  'GENERIC',
];

const App = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parsedLog, setParsedLog] = useState<ParsedDebugLog | null>(null);

  const [showDebug, setShowDebug] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<MainTab>('tree');

  useEffect(() => {
    async function loadLog() {
      const params = new URLSearchParams(window.location.search);
      const logId = params.get('logId');
      const domain = params.get('domain');
      const demo = params.get('demo') !== null || (!logId && import.meta.env.DEV);

      try {
        let body: string;
        if (demo) {
          body = SAMPLE_LOG;
        } else if (!logId || !domain) {
          setError('Missing log ID or Salesforce domain in the URL.');
          setLoading(false);
          return;
        } else {
          const sessionId = await getSessionId(domain);
          if (!sessionId) {
            setError('Session not found. Open Salesforce in another tab and log in, then retry.');
            setLoading(false);
            return;
          }
          body = await fetchLogBody(domain, sessionId, logId);
        }

        const parsed = await parseLogInWorker(body);
        setParsedLog(parsed);
        // Error-first: preselect the first exception on load.
        if (parsed.exceptions.length > 0) setSelectedId(parsed.exceptions[0]!.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load debug log');
      } finally {
        setLoading(false);
      }
    }
    loadLog();
  }, []);

  const nodeIndex = useMemo(
    () => indexTree(parsedLog?.executionTree ?? null),
    [parsedLog],
  );

  const treeNodes = useMemo(() => {
    if (!parsedLog) return [];
    const options = {
      showDebug,
      collapsed,
      search,
      types: activeTypes.size > 0 ? activeTypes : undefined,
    };
    const fromTree = flattenExecutionTree(parsedLog.executionTree, options);
    if (fromTree.length > 0 || parsedLog.executionTree?.children.length) return fromTree;
    return flattenEventLines(parsedLog.eventLines, options);
  }, [parsedLog, showDebug, collapsed, search, activeTypes]);

  const availableTypes = useMemo(() => {
    const present = new Set<string>();
    for (const node of nodeIndex.values()) {
      if ('children' in node && node.synthetic) continue;
      present.add(node.type);
    }
    return TYPE_ORDER.filter((t) => present.has(t));
  }, [nodeIndex]);

  const analysis = useMemo(() => analyze(parsedLog?.executionTree ?? null), [parsedLog]);

  const selected = selectedId ? nodeIndex.get(selectedId) ?? null : null;

  const toggleNode = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleType = (type: string) =>
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(collectExpandableIds(parsedLog?.executionTree ?? null)));

  if (loading) {
    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        <span className="animate-pulse text-sm">Loading debug log…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-zinc-950 p-6">
        <div className="flex max-w-md flex-col items-center gap-3 text-center text-red-400">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const m = parsedLog?.metrics;

  return (
    <div className="flex h-full min-h-screen w-full overflow-hidden bg-zinc-950 font-sans text-zinc-300">
      <Sidebar />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/60 bg-zinc-900/50 px-4">
          <h1 className="truncate text-sm font-medium">
            Debug Log
            {parsedLog ? (
              <span className="ml-2 text-zinc-500">
                {treeNodes.length.toLocaleString()} shown · {parsedLog.rawLineCount.toLocaleString()} lines
              </span>
            ) : null}
          </h1>
          {m ? (
            <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
              <span>SOQL {m.totalSoql}</span>
              <span>DML {m.totalDml}</span>
              <span>Rows {m.totalDmlRows}</span>
              {m.cpuTimeMs > 0 ? <span>CPU {m.cpuTimeMs}ms</span> : null}
              <span className={m.exceptionCount > 0 ? 'text-red-400' : ''}>
                Errors {m.exceptionCount}
              </span>
            </div>
          ) : null}
        </header>

        {parsedLog?.truncated ? (
          <div className="shrink-0 bg-yellow-500/10 px-4 py-1.5 text-xs text-yellow-500">
            ⚠ Log was truncated (maximum debug log size reached). Some events may be missing.
          </div>
        ) : null}

        <TabBar
          active={tab}
          onChange={setTab}
          exceptionCount={parsedLog?.metrics.exceptionCount ?? 0}
        />

        {tab === 'tree' ? (
          <FilterBar
            availableTypes={availableTypes}
            activeTypes={activeTypes}
            onToggleType={toggleType}
            onClearTypes={() => setActiveTypes(new Set())}
            search={search}
            onSearch={setSearch}
            showDebug={showDebug}
            onToggleDebug={setShowDebug}
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
          />
        ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          {tab === 'tree' ? (
            treeNodes.length > 0 ? (
              <VirtualTree
                nodes={treeNodes}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggle={toggleNode}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                No events match the current filters.
              </div>
            )
          ) : tab === 'timeline' ? (
            <Timeline
              root={parsedLog?.executionTree ?? null}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : tab === 'governor' ? (
            parsedLog ? (
              <GovernorDashboard limits={parsedLog.governorLimits} metrics={parsedLog.metrics} />
            ) : null
          ) : tab === 'analysis' ? (
            <AnalysisView analysis={analysis} />
          ) : (
            <RawLogView lines={parsedLog?.eventLines ?? []} />
          )}
        </div>
      </main>

      <Inspector
        selected={selected}
        exceptions={parsedLog?.exceptions ?? []}
        onSelectException={setSelectedId}
      />
    </div>
  );
};

// Reuse a single root across HMR updates to avoid duplicate-root warnings and
// orphaned event handlers in dev.
const container = document.getElementById('root')!;
const w = window as unknown as { __sfdaRoot?: ReturnType<typeof createRoot> };
const root = w.__sfdaRoot ?? (w.__sfdaRoot = createRoot(container));
root.render(<App />);
