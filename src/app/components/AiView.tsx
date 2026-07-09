import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Coins, Loader2, ExternalLink } from 'lucide-react';
import type { ParsedDebugLog } from '../../types';
import type { Analysis } from '../utils/analysis';
import { buildAiContext, FULL_LOG_CHAR_LIMIT } from '../../ai/context';
import { PROVIDER_META, fetchOpenRouterModels, type ModelOption } from '../../ai/models';
import { Markdown } from './Markdown';

interface Props {
  log: ParsedDebugLog | null;
  analysis: Analysis;
  /** The raw log text — sent in full to the provider (user opt-in). */
  rawLog: string | null;
  ai: { loading: boolean; result: string | null; error: string | null };
  onRun: (providerId: string, apiKey: string, model: string, baseUrl: string) => void;
}

const CUSTOM_MODEL = '__custom__';

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none';

export const AiView = ({ log, analysis, rawLog, ai, onRun }: Props) => {
  const [providerId, setProviderId] = useState(
    () => localStorage.getItem('sfda_ai_provider') ?? 'openrouter',
  );
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(`sfda_ai_key_${providerId}`) ?? '',
  );
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('sfda_ai_baseurl') ?? '');
  const [modelChoice, setModelChoice] = useState(
    () => localStorage.getItem(`sfda_ai_model_${providerId}`) ?? '',
  );
  const [customModel, setCustomModel] = useState('');
  const [openRouterModels, setOpenRouterModels] = useState<ModelOption[]>([]);

  const meta = PROVIDER_META.find((p) => p.id === providerId) ?? PROVIDER_META[0]!;

  // Live OpenRouter catalog (cached; static fallback offline).
  useEffect(() => {
    if (providerId !== 'openrouter') return;
    let cancelled = false;
    fetchOpenRouterModels().then((models) => {
      if (!cancelled) setOpenRouterModels(models);
    });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const options = useMemo<ModelOption[]>(() => {
    if (providerId === 'openrouter') return openRouterModels;
    return meta.models.map((id) => ({ id, label: id, free: false }));
  }, [providerId, openRouterModels, meta]);

  // Effective model: picklist choice, or the custom text input.
  const model = modelChoice === CUSTOM_MODEL ? customModel : modelChoice || options[0]?.id || '';

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
    setModelChoice(localStorage.getItem(`sfda_ai_model_${id}`) ?? '');
  };

  const keyMissing = meta.needsKey && !apiKey;
  const customUrlMissing = providerId === 'custom' && !baseUrl.trim();
  const disabled = ai.loading || !log || !model || keyMissing || customUrlMissing;

  const run = () => {
    localStorage.setItem(`sfda_ai_key_${providerId}`, apiKey);
    localStorage.setItem(`sfda_ai_model_${providerId}`, modelChoice || model);
    localStorage.setItem('sfda_ai_baseurl', baseUrl);
    onRun(providerId, apiKey, model, baseUrl);
  };

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        {/* config */}
        <section className="rounded-lg border border-border bg-card/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-vf" />
              <h2 className="text-sm font-medium text-foreground">AI Log Analysis</h2>
            </div>
            {meta.keyUrl ? (
              <a
                href={meta.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-debug hover:underline"
              >
                Get a key <ExternalLink size={11} />
              </a>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-xs text-muted-foreground">
              Provider
              <select
                value={providerId}
                onChange={(e) => changeProvider(e.target.value)}
                className={inputCls}
              >
                {PROVIDER_META.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-muted-foreground">
              Model
              <select
                value={modelChoice || options[0]?.id || ''}
                onChange={(e) => setModelChoice(e.target.value)}
                className={inputCls}
              >
                {options.length === 0 && providerId === 'openrouter' ? (
                  <option value="">Loading models…</option>
                ) : null}
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value={CUSTOM_MODEL}>Custom model id…</option>
              </select>
            </label>

            <label className="block text-xs text-muted-foreground">
              API key {meta.needsKey ? '' : '(optional)'}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                className={`${inputCls} font-mono`}
              />
            </label>

            {modelChoice === CUSTOM_MODEL ? (
              <label className="block text-xs text-muted-foreground">
                Custom model id
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="vendor/model-name"
                  className={`${inputCls} font-mono`}
                />
              </label>
            ) : null}

            {providerId === 'custom' ? (
              <label className="block text-xs text-muted-foreground sm:col-span-2">
                Base URL (OpenAI-compatible; server must allow CORS)
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://my-llm.example.com/v1"
                  className={`${inputCls} font-mono`}
                />
              </label>
            ) : null}
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
                per run.
                {providerId === 'openrouter'
                  ? ' Models tagged (free) cost nothing on OpenRouter.'
                  : ' API tokens will be consumed.'}
                {clipped
                  ? ' This log exceeds the context budget; the middle section will be clipped.'
                  : ''}{' '}
                Key stays in this browser.
              </span>
            </p>
            <button
              type="button"
              onClick={run}
              disabled={disabled}
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
