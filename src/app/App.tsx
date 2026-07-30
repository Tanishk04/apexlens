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
import {
  buildAiContext,
  buildPrompt,
  buildFullPrompt,
  DEFAULT_SEND_SCOPE,
  type AiSendScope,
  type OutputFormatId,
} from '../ai/context';
import { getProvider } from '../ai/adapter';
import {
  flattenEventLines,
  flattenExecutionTree,
  indexTree,
  buildParentMap,
  ancestorIds,
  collectExpandableIds,
} from './utils/flattenTree';
import { getSessionId, fetchLogBody, isAllowedSalesforceDomain } from '../api/salesforce';
import { parseLogInWorker, isAbortError } from './utils/parseInWorker';
import { SAMPLE_LOG } from './sampleLog';
import type { ParsedDebugLog } from '../types';
import '../index.css';

// Tabs where in-app Find (Ctrl/Cmd+F) is available.
const FIND_TABS = new Set<MainTab>(['explorer', 'rawtree', 'tree']);

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

/**
 * Explain a missing session in terms the user can act on.
 *
 * Cookies are per-profile, and the old wording — "open Salesforce in another tab
 * and log in" — was actively wrong for the most common cause: the user *was*
 * logged in, just in a private window whose cookie jar this page cannot see. Say
 * which profile we looked in, since that is the fact that resolves it.
 */
function sessionNotFoundMessage(): string {
  const inPrivate =
    typeof chrome !== 'undefined' && chrome.extension?.inIncognitoContext === true;
  return inPrivate
    ? 'No Salesforce session found in this private window. Log in to the org here — a session ' +
        'in a normal window is a separate profile and cannot be used from Incognito.'
    : 'No Salesforce session found in this browser profile. Log in to the org in this window, ' +
        'then retry. If you opened the org in a private window, ApexLens needs "Allow in ' +
        'Incognito" enabled on chrome://extensions to reach that session.';
}

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
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
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

  /**
   * In-flight load, so opening another log supersedes it rather than racing
   * it — see `parseLogInWorker`. A ref (not state) because superseding must
   * take effect immediately on the next call, not after a re-render.
   */
  const loadAbort = useRef<AbortController | null>(null);

  /**
   * Supersede any load still running and take ownership of the next one.
   *
   * Claimed when the load is *requested*, not when parsing starts. Reading the
   * file is itself async and scales with its size, so a large log can still be
   * in `file.text()` while a small one requested later parses and renders
   * fully — then the large one finally starts, supersedes nothing, and wins.
   * That is the reported "jumped between logs too fast" symptom exactly:
   * whichever log was slowest to read ends up on screen, not the one clicked
   * last.
   */
  const beginLoad = useCallback(() => {
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    return controller.signal;
  }, []);

  /** Parse a log body, capture meta, and run error-first navigation. */
  const ingest = useCallback(async (body: string, name: string, signal: AbortSignal) => {
    const started = performance.now();
    const parsed = await parseLogInWorker(body, signal);
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

      // Set only when this load was superseded by a newer one, which then owns
      // the spinner. Tracked rather than early-returning past the `finally`,
      // because the other `return`s below (standalone launch, bad domain, no
      // session) all still need the spinner cleared normally.
      let superseded = false;
      const signal = beginLoad();
      try {
        if (demo) {
          await ingest(SAMPLE_LOG, 'demo-log', signal);
        } else if (!logId || !domain) {
          // Standalone launch (toolbar icon): show the landing state.
          return;
        } else if (!isAllowedSalesforceDomain(domain)) {
          // `domain`/`logId` arrive via URL query params — this page can only be
          // reached first-party (background opens it via chrome.tabs.create), but
          // fail closed rather than trust an unexpected domain unconditionally.
          setError('Unrecognized Salesforce domain — refusing to fetch.');
          return;
        } else {
          const sessionId = await getSessionId(domain);
          if (!sessionId) {
            setError(sessionNotFoundMessage());
            return;
          }
          const body = await fetchLogBody(domain, sessionId, logId);
          if (signal.aborted) {
            superseded = true;
            return;
          }
          await ingest(body, logId, signal);
        }
      } catch (err) {
        // See openLogFile: a superseded parse belongs to whichever call
        // replaced it, which owns the spinner and any error from here.
        if (isAbortError(err)) superseded = true;
        else setError(err instanceof Error ? err.message : 'Failed to load debug log');
      } finally {
        if (!superseded) setLoading(false);
      }
    }
    loadLog();
  }, [ingest, beginLoad]);

  const nodeIndex = useMemo(() => indexTree(parsedLog?.executionTree ?? null), [parsedLog]);

  const treeNodes = useMemo(() => {
    if (!parsedLog) return [];
    const options = {
      showDebug,
      collapsed,
      search,
      ...(activeTypes.size > 0 ? { types: activeTypes } : {}),
    };
    const fromTree = flattenExecutionTree(parsedLog.executionTree, options);
    if (fromTree.length > 0 || parsedLog.executionTree?.children.length) return fromTree;
    return flattenEventLines(parsedLog.eventLines, options);
  }, [parsedLog, showDebug, collapsed, search, activeTypes]);

  const availableTypes = useMemo(() => {
    const present = new Set<string>();
    for (const node of nodeIndex.values()) {
      if ('children' in node) {
        if (node.synthetic) continue;
        present.add(node.type);
      } else {
        // Statements are filtered by their display category, so the chips must
        // offer the same value the rows carry (see flattenExecutionTree).
        present.add(node.category ?? node.type);
      }
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

  /** Jump from a tree/detail row to its exact raw-log line in Log Explorer. */
  const jumpToLine = useCallback((line: number) => {
    setTab('explorer');
    setScrollToLine(line);
  }, []);

  /**
   * One-shot AI analysis. `scope` decides what actually leaves the browser: the
   * structured summary alone (default), or the summary plus the full raw log.
   */
  const runAi = useCallback(
    async (
      providerId: string,
      apiKey: string,
      model: string,
      baseUrl: string,
      formatId: OutputFormatId,
      scope: AiSendScope = DEFAULT_SEND_SCOPE,
    ) => {
      if (!parsedLog) return;
      const provider = getProvider(providerId, baseUrl);
      if (!provider) return;
      setAi({ loading: true, result: null, error: null });
      try {
        const context = buildAiContext(parsedLog, analysis);
        const prompt =
          scope === 'full' && rawLog != null
            ? buildFullPrompt(rawLog, context, formatId)
            : buildPrompt(context, formatId);
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
      const signal = beginLoad();
      setLoading(true);
      setError(null);
      setAi({ loading: false, result: null, error: null });
      setSelectedId(null);
      setCollapsed(new Set());
      // A superseded load is the user opening another log, not a failure:
      // reporting it would replace the log they actually want with an error,
      // and clearing `loading` would stop the spinner while the newer load is
      // still running. The newer call owns both from here.
      let superseded = false;
      try {
        const text = await file.text();
        // Reading a large file is slow enough that another log can be picked
        // in the meantime — checked here as well as inside the parse.
        if (signal.aborted) {
          superseded = true;
          return;
        }
        await ingest(text, file.name, signal);
      } catch (err) {
        if (isAbortError(err)) superseded = true;
        else setError(err instanceof Error ? err.message : 'Failed to parse log file');
      } finally {
        if (!superseded) setLoading(false);
      }
    },
    [ingest, beginLoad],
  );

  /** Issues chip: reveal the next exception, cycling through them. */
  const jumpToNextException = useCallback(() => {
    const exceptions = parsedLog?.exceptions ?? [];
    if (exceptions.length === 0) return;
    const current = exceptions.findIndex((e) => e.id === selectedId);
    const next = exceptions[(current + 1) % exceptions.length]!;
    revealNode(next.id);
  }, [parsedLog, selectedId, revealNode]);

  const toggleNode = useCallback(
    (id: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const toggleType = useCallback(
    (type: string) =>
      setActiveTypes((prev) => {
        const next = new Set(prev);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
      }),
    [],
  );

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsed(new Set(collectExpandableIds(parsedLog?.executionTree ?? null))),
    [parsedLog],
  );

  // Global shortcuts: Ctrl/Cmd+K palette, Ctrl/Cmd+F in-app find.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        // In-app find only on searchable tabs; elsewhere let the browser's
        // native find work. On a supported tab, Ctrl+F toggles the bar.
        if (!FIND_TABS.has(tabRef.current)) return;
        e.preventDefault();
        setFindTabs((prev) => {
          const next = new Set(prev);
          if (next.has(tabRef.current)) next.delete(tabRef.current);
          else next.add(tabRef.current);
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

  const findSupported = FIND_TABS.has(tab);
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
        run: () => {
          // Ensure we're on a searchable tab, then open the find bar there.
          const target = FIND_TABS.has(tabRef.current) ? tabRef.current : 'explorer';
          setTab(target);
          setFindTabs((prev) => new Set(prev).add(target));
        },
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
  }, [parsedLog, revealNode, toggleTheme, expandAll, collapseAll]);

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
        onOpenSettings={() => {
          // This page runs as an extension page (not a content script, which
          // cannot call this API directly — see the `openOptions` message
          // handler in background/index.ts), so it can call it directly.
          if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
            chrome.runtime.openOptionsPage();
          } else {
            // Dev-server / plain-webpage context (no extension APIs) — best
            // effort so the button still does something during local testing.
            window.open('/src/options/index.html', '_blank');
          }
        }}
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
        {findSupported ? (
          <FindBar
            open={findOpen}
            query={findQuery}
            caseSensitive={findCase}
            matchCount={matchCount}
            index={findIndex}
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
        ) : null}
        {/*
          Every tab panel stays mounted; only its visibility toggles. Each one
          holds scroll position and other UI state (react-virtual's scroll
          offset, our shared horizontal scroll in the Execution Tree,
          Timeline's pan/zoom) inside the component instance itself — the
          previous `tab === X ? <A/> : tab === Y ? <B/> : ...` chain unmounted
          every panel that wasn't active, discarding that state on every tab
          switch and reopening each view at its initial scroll position.
          `absolute inset-0` lets every panel occupy the same box without a
          flex/grid layout having to arbitrate between several visible
          children — exactly one is ever un-hidden.
        */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <div className={`absolute inset-0 ${tab === 'tree' ? '' : 'hidden'}`}>
            {treeNodes.length > 0 ? (
              <VirtualTree
                nodes={treeNodes}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggle={toggleNode}
                scrollToId={scrollToId}
                find={find}
                onMatches={onMatches}
                onJumpToLine={jumpToLine}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No events match the current filters.
              </div>
            )}
          </div>
          <div className={`absolute inset-0 ${tab === 'timeline' ? '' : 'hidden'}`}>
            <Timeline
              root={parsedLog?.executionTree ?? null}
              selectedId={selectedId}
              onSelect={setSelectedId}
              theme={theme}
              active={tab === 'timeline'}
            />
          </div>
          <div className={`absolute inset-0 ${tab === 'governor' ? '' : 'hidden'}`}>
            {parsedLog ? (
              <GovernorDashboard limits={parsedLog.governorLimits} metrics={parsedLog.metrics} />
            ) : null}
          </div>
          <div className={`absolute inset-0 ${tab === 'execution' ? '' : 'hidden'}`}>
            <ExecutionAnalysis analysis={analysis} />
          </div>
          <div className={`absolute inset-0 ${tab === 'soql' ? '' : 'hidden'}`}>
            <SoqlAnalysis analysis={analysis} onJumpToLine={jumpToLine} />
          </div>
          <div className={`absolute inset-0 ${tab === 'dml' ? '' : 'hidden'}`}>
            <DmlAnalysis analysis={analysis} />
          </div>
          <div className={`absolute inset-0 ${tab === 'flow' ? '' : 'hidden'}`}>
            <FlowAnalysis analysis={analysis} />
          </div>
          <div className={`absolute inset-0 ${tab === 'debug' ? '' : 'hidden'}`}>
            <DebugView lines={parsedLog?.eventLines ?? []} />
          </div>
          <div className={`absolute inset-0 ${tab === 'rawtree' ? '' : 'hidden'}`}>
            <RawTreeView
              lines={parsedLog?.eventLines ?? []}
              find={find}
              onMatches={onMatches}
              theme={theme}
            />
          </div>
          <div className={`absolute inset-0 ${tab === 'summary' ? '' : 'hidden'}`}>
            <SummaryView log={parsedLog} analysis={analysis} />
          </div>
          <div className={`absolute inset-0 ${tab === 'ai' ? '' : 'hidden'}`}>
            <AiView log={parsedLog} analysis={analysis} rawLog={rawLog} ai={ai} onRun={runAi} />
          </div>
          <div className={`absolute inset-0 ${tab === 'explorer' ? '' : 'hidden'}`}>
            <LogExplorerView
              rawLog={rawLog}
              find={find}
              onMatches={onMatches}
              theme={theme}
              scrollToLine={scrollToLine}
            />
          </div>
        </div>

        {tab === 'tree' && selected ? (
          <DetailPanel
            selected={selected}
            exception={parsedLog?.exceptions.find((e) => e.id === selectedId) ?? null}
            onClose={() => setSelectedId(null)}
            onJumpToLine={jumpToLine}
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
