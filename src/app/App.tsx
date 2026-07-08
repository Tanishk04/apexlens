import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, Download, Command } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { VirtualTree } from './components/VirtualTree';
import { FilterBar } from './components/FilterBar';
import { Inspector } from './components/Inspector';
import { TabBar, type MainTab } from './components/TabBar';
import { GovernorDashboard } from './components/GovernorDashboard';
import { AnalysisView } from './components/AnalysisView';
import { RawLogView } from './components/RawLogView';
import { Timeline } from './components/Timeline';
import { CommandPalette, type Command as PaletteCommand } from './components/CommandPalette';
import { analyze } from './utils/analysis';
import { toMarkdown, downloadText } from './utils/exportMarkdown';
import { buildAiContext } from '../ai/context';
import { anthropicProvider } from '../ai/adapter';
import {
  flattenEventLines,
  flattenExecutionTree,
  indexTree,
  buildParentMap,
  ancestorIds,
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
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ai, setAi] = useState<{ loading: boolean; result: string | null; error: string | null }>({
    loading: false,
    result: null,
    error: null,
  });

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
        // Error-first: preselect the first exception and scroll the tree to it.
        if (parsed.exceptions.length > 0) {
          const excId = parsed.exceptions[0]!.id;
          setSelectedId(excId);
          setScrollToId(excId);
        }
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
  const parentMap = useMemo(
    () => buildParentMap(parsedLog?.executionTree ?? null),
    [parsedLog],
  );

  const selected = selectedId ? nodeIndex.get(selectedId) ?? null : null;

  /** Select a node, expand its ancestors, switch to the Tree tab and scroll to it. */
  const revealNode = useCallback(
    (id: string) => {
      const ancestors = ancestorIds(id, parentMap, nodeIndex);
      if (ancestors.length > 0) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          for (const a of ancestors) next.delete(a);
          return next;
        });
      }
      setSelectedId(id);
      setTab('tree');
      setScrollToId(id);
    },
    [parentMap, nodeIndex],
  );

  const explainWithAI = useCallback(async () => {
    if (!parsedLog) return;
    let key = localStorage.getItem('sfda_anthropic_key');
    if (!key) {
      key = window.prompt('Enter your Anthropic API key (stored locally, never uploaded):');
      if (!key) return;
      localStorage.setItem('sfda_anthropic_key', key);
    }
    setAi({ loading: true, result: null, error: null });
    try {
      const context = buildAiContext(parsedLog, analysis);
      const result = await anthropicProvider.explain(context, key);
      setAi({ loading: false, result, error: null });
    } catch (err) {
      setAi({
        loading: false,
        result: null,
        error: err instanceof Error ? err.message : 'AI request failed',
      });
    }
  }, [parsedLog, analysis]);

  const exportMarkdown = useCallback(() => {
    if (!parsedLog) return;
    downloadText('salesforce-debug-log.md', toMarkdown(parsedLog, analysis));
  }, [parsedLog, analysis]);

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

  // ⌘K / Ctrl+K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [
      { id: 'tab-tree', label: 'Go to Tree', hint: 'view', run: () => setTab('tree') },
      { id: 'tab-timeline', label: 'Go to Timeline', hint: 'view', run: () => setTab('timeline') },
      { id: 'tab-governor', label: 'Go to Governor', hint: 'view', run: () => setTab('governor') },
      { id: 'tab-analysis', label: 'Go to Analysis', hint: 'view', run: () => setTab('analysis') },
      { id: 'tab-raw', label: 'Go to Raw log', hint: 'view', run: () => setTab('raw') },
      { id: 'expand', label: 'Expand all', hint: 'tree', run: expandAll },
      { id: 'collapse', label: 'Collapse all', hint: 'tree', run: collapseAll },
      { id: 'clear', label: 'Clear type filters', hint: 'filter', run: () => setActiveTypes(new Set()) },
      { id: 'export', label: 'Export report as Markdown', hint: 'export', run: exportMarkdown },
      { id: 'ai', label: 'Explain log with AI', hint: 'ai', run: explainWithAI },
    ];
    const exceptions = parsedLog?.exceptions ?? [];
    exceptions.forEach((ex, i) => {
      cmds.push({
        id: 'exc-' + ex.id,
        label: `Jump to exception: ${ex.exceptionType}`,
        hint: `error ${i + 1}`,
        run: () => revealNode(ex.id),
      });
    });
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedLog, exportMarkdown, explainWithAI, revealNode]);

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
          <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
            {m ? (
              <>
                <span>SOQL {m.totalSoql}</span>
                <span>DML {m.totalDml}</span>
                <span>Rows {m.totalDmlRows}</span>
                {m.cpuTimeMs > 0 ? <span>CPU {m.cpuTimeMs}ms</span> : null}
                <span className={m.exceptionCount > 0 ? 'text-red-400' : ''}>
                  Errors {m.exceptionCount}
                </span>
              </>
            ) : null}
            <button
              type="button"
              onClick={exportMarkdown}
              title="Export report as Markdown"
              className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Download size={13} /> Export
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Command palette (⌘K)"
              className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Command size={13} /> K
            </button>
          </div>
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
                scrollToId={scrollToId}
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
        onSelectException={revealNode}
        onExplain={explainWithAI}
        ai={ai}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
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
