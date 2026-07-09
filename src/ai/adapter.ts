import type { AiPrompt } from './context';

export interface AiProvider {
  id: string;
  label: string;
  /** Send a prepared prompt pair and return the diagnosis markdown. */
  explain(prompt: AiPrompt, apiKey: string, model?: string): Promise<string>;
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
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
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
    }
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
      const res = await fetch(`${baseUrl}/chat/completions`, {
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
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`API error ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    },
  };
}

export const PROVIDERS: AiProvider[] = [
  anthropicProvider,
  openAiCompatibleProvider(),
  openAiCompatibleProvider('http://localhost:11434/v1', 'ollama', 'Ollama (local)'),
];
