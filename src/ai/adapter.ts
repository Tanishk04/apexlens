import type { AiPrompt } from './context';

export interface AiProvider {
  id: string;
  label: string;
  /** Send a prepared prompt pair and return the diagnosis markdown. */
  explain(prompt: AiPrompt, apiKey: string, model?: string): Promise<string>;
}

/** Pull the human-readable message out of a JSON or plain-text error body. */
function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // not JSON — fall through to raw text
  }
  return body.slice(0, 300);
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a fetch-and-parse call with retries on transient failures (rate limits,
 * upstream hiccups — common on free-tier models). Throws a clean, actionable
 * Error on final failure instead of a raw JSON blob.
 */
async function withRetry(
  label: string,
  attempt: () => Promise<Response>,
): Promise<Response> {
  let lastRes: Response | null = null;
  let lastBody = '';
  for (let i = 0; i <= MAX_RETRIES; i++) {
    const res = await attempt();
    if (res.ok) return res;
    lastRes = res;
    lastBody = await res.text().catch(() => res.statusText);
    if (!RETRYABLE_STATUS.has(res.status) || i === MAX_RETRIES) break;
    await sleep(RETRY_DELAY_MS * (i + 1));
  }
  const msg = extractErrorMessage(lastBody);
  if (lastRes?.status === 429) {
    throw new Error(
      `${label} is rate-limited right now (${msg}). Free models get busy — wait a few ` +
        `seconds and try again, or pick a different (free) model from the list.`,
    );
  }
  throw new Error(`${label} error ${lastRes?.status ?? ''}: ${msg}`);
}

/**
 * Anthropic Claude provider. Runs from the extension page (host permission for
 * api.anthropic.com is declared in the manifest). BYOK — the key is supplied by
 * the user and stored locally.
 */
export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  label: 'Claude (Anthropic)',
  async explain({ system, user }, apiKey, model = 'claude-opus-4-8') {
    const res = await withRetry('Anthropic', () =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // Allow calling from a browser extension origin.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      }),
    );
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
      .trim();
  },
};

/**
 * OpenAI-compatible provider (also works with local servers like Ollama or
 * LM Studio that expose /v1/chat/completions). baseUrl is configurable.
 */
export function openAiCompatibleProvider(
  baseUrl = 'https://api.openai.com/v1',
  id = 'openai',
  label = 'OpenAI',
): AiProvider {
  return {
    id,
    label,
    async explain({ system, user }, apiKey, model = 'gpt-4o-mini') {
      const res = await withRetry(label, () =>
        fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        }),
      );
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    },
  };
}

export const PROVIDERS: AiProvider[] = [
  openAiCompatibleProvider('https://openrouter.ai/api/v1', 'openrouter', 'OpenRouter (free models)'),
  anthropicProvider,
  openAiCompatibleProvider('https://api.openai.com/v1', 'openai', 'ChatGPT (OpenAI)'),
  openAiCompatibleProvider('http://localhost:11434/v1', 'ollama', 'Ollama (local)'),
];

/**
 * Resolve a provider by id. `custom` builds an OpenAI-compatible adapter for a
 * user-supplied base URL (self-hosted, LM Studio, enterprise proxies, …).
 */
export function getProvider(id: string, customBaseUrl?: string): AiProvider | undefined {
  if (id === 'custom') {
    const base = (customBaseUrl ?? '').replace(/\/$/, '');
    if (!base) return undefined;
    return openAiCompatibleProvider(base, 'custom', 'Custom endpoint');
  }
  return PROVIDERS.find((p) => p.id === id);
}
