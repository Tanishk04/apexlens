import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { VirtualTree } from './components/VirtualTree';
import { flattenEventLines, flattenExecutionTree } from './utils/flattenTree';
import { getSessionId, fetchLogBody } from '../api/salesforce';
import { SalesforceLogParser } from '../parser';
import type { ParsedDebugLog } from '../types';
import '../index.css';

const App = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parsedLog, setParsedLog] = useState<ParsedDebugLog | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    async function loadLog() {
      const params = new URLSearchParams(window.location.search);
      const logId = params.get('logId');
      const domain = params.get('domain');

      if (!logId || !domain) {
        setError('Missing log ID or Salesforce domain in the URL.');
        setLoading(false);
        return;
      }

      try {
        const sessionId = await getSessionId(domain);
        if (!sessionId) {
          setError('Session not found. Open Salesforce in another tab and log in, then try again.');
          setLoading(false);
          return;
        }

        const body = await fetchLogBody(domain, sessionId, logId);
        const parser = new SalesforceLogParser();
        parser.parseChunk(body);
        setParsedLog(parser.finish());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load debug log';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadLog();
  }, []);

  const treeNodes = useMemo(() => {
    if (!parsedLog) return [];

    const options = { showDebug };
    const fromTree = flattenExecutionTree(parsedLog.executionTree, options);
    if (fromTree.length > 0) return fromTree;

    return flattenEventLines(parsedLog.eventLines, options);
  }, [parsedLog, showDebug]);

  if (loading) {
    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        <span className="animate-pulse text-sm">Loading debug log...</span>
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

  return (
    <div className="flex h-full min-h-screen w-full bg-zinc-950 font-sans text-zinc-300 overflow-hidden">
      <Sidebar />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/60 bg-zinc-900/50 px-4">
          <h1 className="truncate text-sm font-medium">
            Debug Log
            {parsedLog ? (
              <span className="ml-2 text-zinc-500">
                {treeNodes.length.toLocaleString()} events · {parsedLog.rawLineCount.toLocaleString()} lines
              </span>
            ) : null}
          </h1>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(event) => setShowDebug(event.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900"
            />
            Show USER_DEBUG
          </label>
        </header>
        <div className="min-h-0 min-w-0 flex-1">
          {treeNodes.length > 0 ? (
            <VirtualTree nodes={treeNodes} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              No meaningful events found. Try enabling USER_DEBUG.
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
