import { openAiCompatibleProvider } from '../ai/adapter';

const prompt = { system: 's', user: 'u' };

function mockResponses(statuses: { status: number; body: string }[]) {
  let i = 0;
  return jest.fn(async () => {
    const r = statuses[Math.min(i, statuses.length - 1)]!;
    i++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: 'x',
      text: async () => r.body,
      json: async () => JSON.parse(r.body),
    } as unknown as Response;
  });
}

describe('openAiCompatibleProvider retry + error handling', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries a 429 and succeeds on a later attempt', async () => {
    global.fetch = mockResponses([
      { status: 429, body: '{"error":{"message":"rate limited"}}' },
      { status: 200, body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) },
    ]);
    const provider = openAiCompatibleProvider('https://x.test/v1', 'x', 'X');
    const result = await provider.explain(prompt, 'key', 'model');
    expect(result).toBe('ok');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it('gives a clean, actionable message after exhausting retries on 429', async () => {
    global.fetch = mockResponses([
      { status: 429, body: '{"error":{"message":"openai/gpt-oss-120b:free is temporarily rate-limited upstream"}}' },
    ]);
    const provider = openAiCompatibleProvider('https://x.test/v1', 'x', 'X');
    await expect(provider.explain(prompt, 'key', 'model')).rejects.toThrow(
      /rate-limited right now.*wait a few seconds.*different \(free\) model/s,
    );
  }, 10000);

  it('does not retry a non-transient error (e.g. 401) and reports it cleanly', async () => {
    global.fetch = mockResponses([{ status: 401, body: '{"error":{"message":"Invalid API key"}}' }]);
    const provider = openAiCompatibleProvider('https://x.test/v1', 'x', 'X');
    await expect(provider.explain(prompt, 'bad-key', 'model')).rejects.toThrow(
      'X error 401: Invalid API key',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
