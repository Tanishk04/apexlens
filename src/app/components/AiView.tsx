import React, { useMemo, useState } from 'react';
import { Sparkles, ShieldCheck, Loader2 } from 'lucide-react';
import type { ParsedDebugLog } from '../../types';
import type { Analysis } from '../utils/analysis';
import { buildAiContext } from '../../ai/context';
import { PROVIDERS } from '../../ai/adapter';

interface Props {
  log: ParsedDebugLog | null;
  analysis: Analysis;
  ai: { loading: boolean; result: string | null; error: string | null };
  onRun: (providerId: string, apiKey: string, model: string) => void;
}

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-4o-mini',
  ollama: 'llama3.1',
};

/** Minimal markdown renderer: headings, bullets, code fences, bold, inline code. */
function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => text.split(/```/), [text]);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-300"
          >
            {block.replace(/^\w+\n/, '')}
          </pre>
        ) : (
          <div key={i}>
            {block.split('\n').map((line, j) => {
              const inline = (s: string) =>
                s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, k) => {
                  if (seg.startsWith('**') && seg.endsWith('**'))
                    return (
                      <strong key={k} className="font-semibold text-zinc-100">
                        {seg.slice(2, -2)}
                      </strong>
                    );
                  if (seg.startsWith('`') && seg.endsWith('`'))
                    return (
                      <code key={k} className="rounded bg-zinc-800 px-1 font-mono text-xs">
                        {seg.slice(1, -1)}
                      </code>
                    );
                  return seg;
                });
              if (/^#{1,3}\s/.test(line))
                return (
                  <h3 key={j} className="mb-1 mt-3 text-sm font-semibold text-zinc-100">
                    {inline(line.replace(/^#{1,3}\s/, ''))}
                  </h3>
                );
              if (/^[-*]\s/.test(line))
                return (
                  <p key={j} className="pl-4">
                    <span className="mr-2 text-zinc-500">•</span>
                    {inline(line.replace(/^[-*]\s/, ''))}
                  </p>
                );
              if (line.trim() === '') return <div key={j} className="h-1.5" />;
              return <p key={j}>{inline(line)}</p>;
            })}
          </div>
        ),
      )}
    </div>
  );
}

export const AiView = ({ log, analysis, ai, onRun }: Props) => {
  const [providerId, setProviderId] = useState(
    () => localStorage.getItem('sfda_ai_provider') ?? 'anthropic',
  );
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(`sfda_ai_key_${providerId}`) ?? '',
  );
  const [model, setModel] = useState(
    () => localStorage.getItem('sfda_ai_model') ?? DEFAULT_MODEL['anthropic']!,
  );

  const contextSize = useMemo(() => {
    if (!log) return 0;
    return JSON.stringify(buildAiContext(log, analysis)).length;
  }, [log, analysis]);

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
    <div className="h-full overflow-auto bg-zinc-950">
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        {/* config */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-blue-400" />
            <h2 className="text-sm font-medium text-zinc-100">AI Log Analysis</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-xs text-zinc-500">
              Provider
              <select
                value={providerId}
                onChange={(e) => changeProvider(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              Model
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              API key {providerId === 'ollama' ? '(optional for local)' : ''}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              <ShieldCheck size={13} className="text-emerald-500" />
              Only a structured summary ({(contextSize / 1024).toFixed(1)} KB) is sent — never the
              raw log. Key stays in this browser.
            </p>
            <button
              type="button"
              onClick={run}
              disabled={ai.loading || !log || (providerId !== 'ollama' && !apiKey)}
              className="flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {ai.error}
          </div>
        ) : null}
        {ai.result ? (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
            <Markdown text={ai.result} />
          </section>
        ) : null}
        {!ai.result && !ai.error && !ai.loading ? (
          <p className="text-center text-xs text-zinc-600">
            The whole parsed log — exceptions, limits, slowest methods, SOQL/DML patterns — is
            analyzed in one pass. No per-line clicking.
          </p>
        ) : null}
      </div>
    </div>
  );
};
