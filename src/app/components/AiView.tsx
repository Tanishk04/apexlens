import React, { useMemo, useState } from 'react';
import { Sparkles, Coins, Loader2 } from 'lucide-react';
import type { ParsedDebugLog } from '../../types';
import type { Analysis } from '../utils/analysis';
import { buildAiContext, FULL_LOG_CHAR_LIMIT } from '../../ai/context';
import { PROVIDERS } from '../../ai/adapter';
import { Markdown } from './Markdown';

interface Props {
  log: ParsedDebugLog | null;
  analysis: Analysis;
  /** The raw log text — sent in full to the provider (user opt-in). */
  rawLog: string | null;
  ai: { loading: boolean; result: string | null; error: string | null };
  onRun: (providerId: string, apiKey: string, model: string) => void;
}

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-4o-mini',
  ollama: 'llama3.1',
};

export const AiView = ({ log, analysis, rawLog, ai, onRun }: Props) => {
  const [providerId, setProviderId] = useState(
    () => localStorage.getItem('sfda_ai_provider') ?? 'anthropic',
  );
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(`sfda_ai_key_${providerId}`) ?? '',
  );
  const [model, setModel] = useState(
    () => localStorage.getItem('sfda_ai_model') ?? DEFAULT_MODEL['anthropic']!,
  );

  // Rough token estimate for the full prompt (raw log + structured summary).
  const tokenEstimate = useMemo(() => {
    if (!log) return 0;
    const contextChars = JSON.stringify(buildAiContext(log, analysis)).length;
    const logChars = Math.min(rawLog?.length ?? 0, FULL_LOG_CHAR_LIMIT);
    return Math.ceil((contextChars + logChars) / 4);
  }, [log, analysis, rawLog]);

  const clipped = (rawLog?.length ?? 0) > FULL_LOG_CHAR_LIMIT;

  const changeProvider = (id: string) => {
    setProviderId(id);
    localStorage.setItem('sfda_ai_provider', id);
    setApiKey(localStorage.getItem(`sfda_ai_key_${id}`) ?? '');
    const m = DEFAULT_MODEL[id] ?? '';
    setModel(m);
    localStorage.setItem('sfda_ai_model', m);
  };

  const run = () => {
    localStorage.setItem(`sfda_ai_key_${providerId}`, apiKey);
    localStorage.setItem('sfda_ai_model', model);
    onRun(providerId, apiKey, model);
  };

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        {/* config */}
        <section className="rounded-lg border border-border bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-debug" />
            <h2 className="text-sm font-medium text-foreground">AI Log Analysis</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-xs text-muted-foreground">
              Provider
              <select
                value={providerId}
                onChange={(e) => changeProvider(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              Model
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm text-foreground focus:border-ring focus:outline-none"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              API key {providerId === 'ollama' ? '(optional for local)' : ''}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm text-foreground focus:border-ring focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Coins size={13} className="mt-0.5 shrink-0 text-validation" />
              <span>
                Sends the <strong className="text-foreground">entire raw log</strong> plus a
                structured summary — about{' '}
                <strong className="text-foreground">
                  ~{tokenEstimate.toLocaleString()} tokens
                </strong>{' '}
                of API usage per run.
                {clipped
                  ? ' This log exceeds the context budget; the middle section will be clipped.'
                  : ''}{' '}
                Key stays in this browser.
              </span>
            </p>
            <button
              type="button"
              onClick={run}
              disabled={ai.loading || !log || (providerId !== 'ollama' && !apiKey)}
              className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ai.loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles size={15} /> Analyze log
                </>
              )}
            </button>
          </div>
        </section>

        {/* result */}
        {ai.error ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error">
            {ai.error}
          </div>
        ) : null}
        {ai.result ? (
          <section className="rounded-lg border border-border bg-card/30 p-5">
            <Markdown text={ai.result} />
          </section>
        ) : null}
        {!ai.result && !ai.error && !ai.loading ? (
          <p className="text-center text-xs text-muted-foreground/70">
            The AI reads the whole log — exceptions, limits, timings, queries — in one pass. No
            per-line clicking.
          </p>
        ) : null}
      </div>
    </div>
  );
};
