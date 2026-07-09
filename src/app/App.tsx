import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle } from 'lucide-react';
import { VirtualTree } from './components/VirtualTree';
import { FilterBar } from './components/FilterBar';
import { DetailPanel } from './components/DetailPanel';
import { TabBar, type MainTab } from './components/TabBar';
import { AppHeader, type LogMeta } from './components/AppHeader';
import { GovernorDashboard } from './components/GovernorDashboard';
import {
  ExecutionAnalysis,
  SoqlAnalysis,
  DmlAnalysis,
  FlowAnalysis,
} from './components/AnalysisView';
import { LogExplorerView } from './components/LogExplorerView';
import { RawTreeView } from './components/RawTreeView';
import { FindBar } from './components/FindBar';
import { DebugView } from './components/DebugView';
import { AiView } from './components/AiView';
import { SummaryView } from './components/SummaryView';
import { Timeline } from './components/Timeline';
import { CommandPalette, type Command as PaletteCommand } from './components/CommandPalette';
import { analyze } from './utils/analysis';
import { useTheme } from './utils/theme';
import { buildAiContext, buildFullPrompt } from '../ai/context';
import { getProvider } from '../ai/adapter';
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
  // Raw log kept for full-log AI analysis (one extra copy of the string).
  const [rawLog, setRawLog] = useState<string | null>(null);
  const [meta, setMeta] = useState<LogMeta | null>(null);

  const [showDebug, setShowDebug] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<MainTab>('explorer');
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();

  // In-app Find (Ctrl/Cmd+F). Open state is PER TAB; query/case are shared.
  const [findTabs, setFindTabs] = useState<Set<MainTab>>(new Set());
  const [findQuery, setFindQuery] = useState('');
  const [findCase, setFindCase] = useState(false);
  const [findIndex, setFindIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [ai, setAi] = useState<{ loading: boolean; result: string | null; error: string | null }>({
    loading: false,
    result: null,
    error: null,
  });

  /** Parse a log body, capture meta, and run error-first navigation. */
  const ingest = useCallback(async (body: string, name: string) => {
    const started = performance.now();
    const parsed = await parseLogInWorker(body);
    setMeta({ name, sizeBytes: body.length, parseMs: performance.now() - started });
    setRawLog(body);
    setParsedLog(parsed);
    if (parsed.exceptions.length > 0) {
      const excId = parsed.exceptions[0]!.id;
      setSelectedId(excId);
      setScrollToId(excId);
      setTab('tree');
    } else {
      setTab('explorer');
    }
  }, []);

  useEffect(() => {
    async function loadLog() {
      const params = new URLSearchParams(window.location.search);
      const logId = params.get('logId');
      const domain = params.get('domain');
      const demo = params.get('demo') !== null || (!logId && import.meta.env.DEV);

      try {
        if (demo) {
          await ingest(SAMPLE_LOG, 'demo-log');
        } else if (!logId || !domain) {
          // Standalone launch (toolbar icon): show the landing state.
          return;
        } else {
          const sessionId = await getSessionId(domain);
          if (!sessionId) {
            setError('Session not found. Open Salesforce in another tab and log in, then retry.');
            return;
          }
          const body = await fetchLogBody(domain, sessionId, logId);
          await ingest(body, logId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load debug log');
      } finally {
        setLoading(false);
      }
    }
    loadLog();
  }, [ingest]);

  const nodeIndex = useMemo(() => indexTree(parsedLog?.executionTree ?? null), [parsedLog]);

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
  const parentMap = useMemo(() => buildParentMap(parsedLog?.executionTree ?? null), [parsedLog]);

  const selected = selectedId ? nodeIndex.get(selectedId) ?? null : null;
  const issues = (parsedLog?.exceptions.length ?? 0) + (parsedLog?.truncated ? 1 : 0);

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

  /** One-shot whole-log AI analysis: full raw log + structured summary. */
  const runAi = useCallback(
    async (providerId: string, apiKey: string, model: string, baseUrl: string) => {
      if (!parsedLog || rawLog == null) return;
      const provider = getProvider(providerId, baseUrl);
      if (!provider) return;
      setAi({ loading: true, result: null, error: null });
      try {
        const prompt = buildFullPrompt(rawLog, buildAiContext(parsedLog, analysis));
        const result = await provider.explain(prompt, apiKey, model || undefined);
        setAi({ loading: false, result, error: null });
      } catch (err) {
        setAi({
          loading: false,
          result: null,
          error: err instanceof Error ? err.message : 'AI request failed',
        });
      }
    },
    [parsedLog, rawLog, analysis],
  );

  /** Open a local .log file (works in dev and in the extension tab). */
  const openLogFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      setAi({ loading: false, result: null, error: null });
      setSelectedId(null);
      setCollapsed(new Set());
      try {
        await ingest(await file.text(), file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse log file');
      } finally {
        setLoading(false);
      }
    },
    [ingest],
  );

  /** Issues chip: reveal the next exception, cycling through them. */
  const jumpToNextException = useCallback(() => {
    const exceptions = parsedLog?.exceptions ?? [];
    if (exceptions.length === 0) return;
    const current = exceptions.findIndex((e) => e.id === selectedId);
    const next = exceptions[(current + 1) % exceptions.length]!;
    revealNode(next.id);
  }, [parsedLog, selectedId, revealNode]);

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
  const collapseAll = () =>
    setCollapsed(new Set(collectExpandableIds(parsedLog?.executionTree ?? null)));

  // Global shortcuts: Ctrl/Cmd+K palette, Ctrl/Cmd+F in-app find.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        // Replace the browser's find with the in-app one (opens on current tab).
        e.preventDefault();
        setFindTabs((prev) => {
          const next = new Set(prev);
          next.add(tabRef.current);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Current tab, readable from the stable keydown handler.
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // Reset the active match when switching tabs (match lists differ per view).
  useEffect(() => {
    setFindIndex(0);
  }, [tab]);

  const findOpen = findTabs.has(tab);
  const closeFind = useCallback(() => {
    setFindTabs((prev) => {
      const next = new Set(prev);
      next.delete(tabRef.current);
      return next;
    });
  }, []);

  const findSupported = tab === 'explorer' || tab === 'rawtree' || tab === 'tree';
  const find = useMemo(
    () => ({ query: findOpen && findSupported ? findQuery : '', caseSensitive: findCase, index: findIndex }),
    [findOpen, findSupported, findQuery, findCase, findIndex],
  );
  const onMatches = useCallback((n: number) => {
    setMatchCount(n);
    setFindIndex((i) => (n === 0 ? 0 : Math.min(i, n - 1)));
  }, []);
  const findNext = useCallback(
    () => setFindIndex((i) => (matchCount ? (i + 1) % matchCount : 0)),
    [matchCount],
  );
  const findPrev = useCallback(
    () => setFindIndex((i) => (matchCount ? (i - 1 + matchCount) % matchCount : 0)),
    [matchCount],
  );

  const commands = useMemo<PaletteCommand[]>(() => {
    const go = (id: MainTab, label: string): PaletteCommand => ({
      id: `tab-${id}`,
      label: `Go to ${label}`,
      hint: 'view',
      run: () => setTab(id),
    });
    const cmds: PaletteCommand[] = [
      go('explorer', 'Log Explorer'),
      go('rawtree', 'Raw Tree'),
      go('debug', 'Apex Debug'),
      go('timeline', 'Execution Timeline'),
      go('tree', 'Execution Tree'),
      go('execution', 'Execution Analysis'),
      go('soql', 'SOQL Analysis'),
      go('dml', 'DML Analysis'),
      go('flow', 'Flow Analysis'),
      go('governor', 'Governor'),
      go('summary', 'Summary'),
      { id: 'tab-ai', label: 'Analyze log with AI', hint: 'ai', run: () => setTab('ai') },
      {
        id: 'find',
        label: 'Find in log',
        hint: 'Ctrl F',
        run: () =>
          setFindTabs((prev) => {
            const next = new Set(prev);
            next.add(tabRef.current);
            return next;
          }),
      },
      { id: 'theme', label: 'Toggle light/dark theme', hint: 'view', run: toggleTheme },
      { id: 'expand', label: 'Expand all', hint: 'tree', run: expandAll },
      { id: 'collapse', label: 'Collapse all', hint: 'tree', run: collapseAll },
      {
        id: 'clear',
        label: 'Clear type filters',
        hint: 'filter',
        run: () => setActiveTypes(new Set()),
      },
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
  }, [parsedLog, revealNode, toggleTheme]);

  if (loading) {
    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-background text-muted-foreground">
        <span className="animate-pulse text-sm">Loading debug log…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-background p-6">
        <div className="flex max-w-md flex-col items-center gap-3 text-center text-error">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <AppHeader
        meta={meta}
        metrics={parsedLog?.metrics ?? null}
        issues={issues}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenFile={openLogFile}
        onOpenPalette={() => setPaletteOpen(true)}
        onIssuesClick={jumpToNextException}
      />

      {!parsedLog ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No log loaded. Use <span className="font-medium text-foreground">Open log</span> above,
            or click <span className="font-medium text-foreground">Analyze</span> on a row in
            Salesforce Setup ▸ Debug Logs.
          </p>
        </div>
      ) : null}

      {parsedLog?.truncated ? (
        <div className="shrink-0 bg-warn/10 px-4 py-1.5 text-xs text-validation">
          ⚠ Log was truncated (maximum debug log size reached). Some events may be missing.
        </div>
      ) : null}

      {parsedLog ? (
        <TabBar active={tab} onChange={setTab} exceptionCount={parsedLog.metrics.exceptionCount} />
      ) : null}

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

      {parsedLog ? (
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <FindBar
          open={findOpen}
          query={findQuery}
          caseSensitive={findCase}
          matchCount={findSupported ? matchCount : 0}
          index={findIndex}
          supported={findSupported}
          onQuery={(q) => {
            setFindQuery(q);
            setFindIndex(0);
          }}
          onToggleCase={() => {
            setFindCase((c) => !c);
            setFindIndex(0);
          }}
          onNext={findNext}
          onPrev={findPrev}
          onClose={closeFind}
        />
        <div className="min-h-0 min-w-0 flex-1">
          {tab === 'tree' ? (
            treeNodes.length > 0 ? (
              <VirtualTree
                nodes={treeNodes}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggle={toggleNode}
                scrollToId={scrollToId}
                find={find}
                onMatches={onMatches}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No events match the current filters.
              </div>
            )
          ) : tab === 'timeline' ? (
            <Timeline
              root={parsedLog?.executionTree ?? null}
              selectedId={selectedId}
              onSelect={setSelectedId}
              theme={theme}
            />
          ) : tab === 'governor' ? (
            parsedLog ? (
              <GovernorDashboard limits={parsedLog.governorLimits} metrics={parsedLog.metrics} />
            ) : null
          ) : tab === 'execution' ? (
            <ExecutionAnalysis analysis={analysis} />
          ) : tab === 'soql' ? (
            <SoqlAnalysis analysis={analysis} />
          ) : tab === 'dml' ? (
            <DmlAnalysis analysis={analysis} />
          ) : tab === 'flow' ? (
            <FlowAnalysis analysis={analysis} />
          ) : tab === 'debug' ? (
            <DebugView lines={parsedLog?.eventLines ?? []} />
          ) : tab === 'rawtree' ? (
            <RawTreeView
              lines={parsedLog?.eventLines ?? []}
              find={find}
              onMatches={onMatches}
              theme={theme}
            />
          ) : tab === 'summary' ? (
            <SummaryView log={parsedLog} analysis={analysis} />
          ) : tab === 'ai' ? (
            <AiView log={parsedLog} analysis={analysis} rawLog={rawLog} ai={ai} onRun={runAi} />
          ) : (
            <LogExplorerView rawLog={rawLog} find={find} onMatches={onMatches} theme={theme} />
          )}
        </div>

        {(tab === 'tree' || tab === 'timeline') && selected ? (
          <DetailPanel
            selected={selected}
            exception={parsedLog?.exceptions.find((e) => e.id === selectedId) ?? null}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
      ) : null}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
};

// Reuse a single root across HMR updates to avoid duplicate-root warnings and
// orphaned event handlers in dev.
const container = document.getElementById('root')!;
const w = window as unknown as { __sfdaRoot?: ReturnType<typeof createRoot> };
const root = w.__sfdaRoot ?? (w.__sfdaRoot = createRoot(container));
root.render(<App />);
