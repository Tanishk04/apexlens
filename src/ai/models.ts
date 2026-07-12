/** Provider metadata + model picklists (curated static + live OpenRouter). */

import { STORAGE_KEYS } from '../app/utils/storageKeys';

export interface ProviderMeta {
  id: string;
  label: string;
  /** OpenAI-compatible base URL; null = native Anthropic API. */
  baseUrl: string | null;
  /** Where to get a key (help link). */
  keyUrl?: string;
  /** Key required to enable Analyze? */
  needsKey: boolean;
  /** Curated model ids (OpenRouter uses the live list instead). */
  models: string[];
  /** Selectable today? false = shown in the dropdown but disabled ("coming soon"). */
  available: boolean;
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    needsKey: true,
    models: [], // populated live from the OpenRouter API
    available: true,
  },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    baseUrl: null,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    needsKey: true,
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    available: false,
  },
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    needsKey: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    available: false,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    models: ['llama3.1', 'qwen2.5-coder', 'mistral'],
    available: false,
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible URL)',
    baseUrl: '', // user supplied
    needsKey: false,
    models: [],
    available: true,
  },
];

export interface ModelOption {
  id: string;
  label: string;
  free: boolean;
}

/** Fallback when the live OpenRouter model list can't be fetched. */
const OPENROUTER_FALLBACK: ModelOption[] = [
  { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek Chat v3 (free)', free: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)', free: true },
  { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (free)', free: true },
  { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (free)', free: true },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', free: false },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', free: false },
];

const CACHE_KEY = STORAGE_KEYS.openRouterModelsCache;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface OpenRouterModel {
  id: string;
  name?: string;
  pricing?: { prompt?: string; completion?: string };
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string;
  };
}

/**
 * Keep only text-in / text-out chat models — drops image-generation (output
 * `image`), TTS (output `audio`), and embedding models that can't run our
 * chat-completion analysis. Tolerant: models with no architecture info are kept.
 */
export function isTextChatModel(m: OpenRouterModel): boolean {
  const a = m.architecture;
  if (!a) return true;
  const parsed = a.modality?.split('->') ?? [];
  const input = a.input_modalities ?? parsed[0]?.split('+') ?? [];
  const output = a.output_modalities ?? parsed[1]?.split('+') ?? [];
  // Input may be multimodal (vision is fine). Output must be text ONLY —
  // reject anything that also emits images or audio (image-gen / TTS models).
  const inOk = input.length === 0 || input.includes('text');
  const outOk =
    output.length === 0 ||
    (output.includes('text') && !output.some((o) => o === 'image' || o === 'audio'));
  return inOk && outOk;
}

/**
 * Fetch the OpenRouter model catalog (no key required), free models first.
 * Cached in localStorage for an hour; falls back to a static list offline.
 */
export async function fetchOpenRouterModels(): Promise<ModelOption[]> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { at, models } = JSON.parse(cached) as { at: number; models: ModelOption[] };
      if (Date.now() - at < CACHE_TTL_MS && models.length > 0) return models;
    }
  } catch {
    // ignore cache corruption
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { data?: OpenRouterModel[] };
    const models: ModelOption[] = (data.data ?? [])
      .filter(isTextChatModel)
      .map((m) => {
        const free =
          m.id.endsWith(':free') ||
          (m.pricing?.prompt === '0' && m.pricing?.completion === '0');
        return { id: m.id, label: (m.name ?? m.id) + (free ? ' (free)' : ''), free };
      })
      .sort((a, b) => Number(b.free) - Number(a.free) || a.label.localeCompare(b.label));
    if (models.length > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), models }));
      return models;
    }
  } catch {
    // offline / blocked — fall through
  }
  return OPENROUTER_FALLBACK;
}
