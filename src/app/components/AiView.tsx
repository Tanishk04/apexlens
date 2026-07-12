import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Coins, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import type { ParsedDebugLog } from '../../types';
import type { Analysis } from '../utils/analysis';
import {
  buildAiContext,
  FULL_LOG_CHAR_LIMIT,
  OUTPUT_FORMAT_OPTIONS,
  DEFAULT_OUTPUT_FORMAT,
  type OutputFormatId,
} from '../../ai/context';
import { PROVIDER_META, fetchOpenRouterModels, type ModelOption } from '../../ai/models';
import { Markdown } from './Markdown';
import { STORAGE_KEYS } from '../utils/storageKeys';

interface Props {
  log: ParsedDebugLog | null;
  analysis: Analysis;
  /** The raw log text — sent in full to the provider (user opt-in). */
  rawLog: string | null;
  ai: { loading: boolean; result: string | null; error: string | null };
  onRun: (
    providerId: string,
    apiKey: string,
    model: string,
    baseUrl: string,
    formatId: OutputFormatId,
  ) => void;
}

const CUSTOM_MODEL = '__custom__';

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none';
// Selects: reserve room for the native arrow and ellipsize long option text.
const selectCls = `${inputCls} truncate pr-7`;

const FALLBACK_PROVIDER_ID = PROVIDER_META.find((p) => p.available)?.id ?? 'openrouter';

export const AiView = ({ log, analysis, rawLog, ai, onRun }: Props) => {
  const [providerId, setProviderId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.aiProvider) ?? FALLBACK_PROVIDER_ID;
    const storedMeta = PROVIDER_META.find((p) => p.id === stored);
    return storedMeta?.available ? stored : FALLBACK_PROVIDER_ID;
  });
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(STORAGE_KEYS.aiKeyFor(providerId)) ?? '',
  );
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.aiBaseUrl) ?? '');
  const [modelChoice, setModelChoice] = useState(
    () => localStorage.getItem(STORAGE_KEYS.aiModelFor(providerId)) ?? '',
  );
  const [customModel, setCustomModel] = useState('');
  const [openRouterModels, setOpenRouterModels] = useState<ModelOption[]>([]);
  const [formatId, setFormatId] = useState<OutputFormatId>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.aiFormat);
    return OUTPUT_FORMAT_OPTIONS.some((o) => o.id === stored)
      ? (stored as OutputFormatId)
      : DEFAULT_OUTPUT_FORMAT;
  });

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

  // Effective model id. OpenRouter: picklist choice (or the custom escape).
  // Other providers: the free-text value, defaulting to the first curated id.
  const model =
    providerId === 'openrouter'
      ? modelChoice === CUSTOM_MODEL
        ? customModel
        : modelChoice || options[0]?.id || ''
      : modelChoice || meta.models[0] || '';

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
    localStorage.setItem(STORAGE_KEYS.aiProvider, id);
    setApiKey(localStorage.getItem(STORAGE_KEYS.aiKeyFor(id)) ?? '');
    setModelChoice(localStorage.getItem(STORAGE_KEYS.aiModelFor(id)) ?? '');
  };

  const keyMissing = meta.needsKey && !apiKey;
  const customUrlMissing = providerId === 'custom' && !baseUrl.trim();
  const disabled = ai.loading || !log || !model || keyMissing || customUrlMissing;

  const run = () => {
    localStorage.setItem(STORAGE_KEYS.aiKeyFor(providerId), apiKey);
    localStorage.setItem(STORAGE_KEYS.aiModelFor(providerId), modelChoice || model);
    localStorage.setItem(STORAGE_KEYS.aiBaseUrl, baseUrl);
    localStorage.setItem(STORAGE_KEYS.aiFormat, formatId);
    onRun(providerId, apiKey, model, baseUrl, formatId);
  };

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-5xl space-y-5 p-6">
        {/* config + result share one centered column so nothing looks orphaned */}
        <section className="rounded-lg border border-border bg-card/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-vf" />
              <h2 className="text-sm font-medium text-foreground">AI Log Analysis</h2>
              <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                BYOK
              </span>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block text-xs text-muted-foreground">
              Provider
              <select
                value={providerId}
                onChange={(e) => changeProvider(e.target.value)}
                className={selectCls}
              >
                {PROVIDER_META.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.available}>
                    {p.label}
                    {p.available ? '' : ' (coming soon)'}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-muted-foreground">
              Model
              {providerId === 'openrouter' ? (
                // Filtered live catalog (text-chat models only) as a picklist.
                <select
                  value={modelChoice || options[0]?.id || ''}
                  onChange={(e) => setModelChoice(e.target.value)}
                  className={selectCls}
                >
                  {options.length === 0 ? <option value="">Loading models…</option> : null}
                  {options.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL}>Custom model id…</option>
                </select>
              ) : meta.models.length > 0 ? (
                // Curated suggestions available (not reachable today — kept for when a
                // disabled provider is re-enabled with a models[] list).
                <>
                  <input
                    type="text"
                    list={`models-${providerId}`}
                    value={modelChoice}
                    onChange={(e) => setModelChoice(e.target.value)}
                    placeholder={meta.models[0] ?? 'model-id'}
                    className={`${inputCls} font-mono`}
                  />
                  <datalist id={`models-${providerId}`}>
                    {meta.models.map((id) => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                </>
              ) : (
                // No curated list to suggest (e.g. Custom) — plain input, no native
                // datalist dropdown arrow.
                <input
                  type="text"
                  value={modelChoice}
                  onChange={(e) => setModelChoice(e.target.value)}
                  placeholder="model-id"
                  className={`${inputCls} font-mono`}
                />
              )}
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

            <label className="block text-xs text-muted-foreground">
              Output detail
              <select
                value={formatId}
                onChange={(e) => {
                  const id = e.target.value as OutputFormatId;
                  setFormatId(id);
                  localStorage.setItem(STORAGE_KEYS.aiFormat, id);
                }}
                className={selectCls}
              >
                {OUTPUT_FORMAT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {providerId === 'openrouter' && modelChoice === CUSTOM_MODEL ? (
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

          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Coins size={13} className="mt-0.5 shrink-0 text-validation" />
                <span>
                  Sends the entire raw log + a structured summary — about{' '}
                  <strong className="text-foreground">
                    ~{tokenEstimate.toLocaleString()} tokens
                  </strong>{' '}
                  per run.
                  {clipped
                    ? ' This log exceeds the context budget; the middle section will be clipped.'
                    : ''}
                </span>
              </p>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Sparkles size={13} className="mt-0.5 shrink-0 text-debug" />
                <span>
                  Bring your own key — your key and log data go straight from this browser to
                  your chosen provider.
                </span>
              </p>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />
                <span>
                  AI analysis can be wrong or incomplete.
                  <br />
                  Always verify findings against the log before acting on them.
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={run}
              disabled={disabled}
              className="flex shrink-0 items-center gap-2 self-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
            <p className="mb-3 flex items-center gap-1.5 border-b border-border pb-3 text-xs text-muted-foreground">
              <AlertTriangle size={13} className="shrink-0 text-warn" />
              AI-generated — may be inaccurate or incomplete. Verify against the raw log before
              relying on it.
            </p>
            <Markdown text={ai.result} />
          </section>
        ) : null}
        {!ai.result && !ai.error && !ai.loading ? (
          <p className="text-center text-xs text-muted-foreground/70">
            The AI reads the whole log — exceptions, limits, timings, queries.
          </p>
        ) : null}
      </div>
    </div>
  );
};
