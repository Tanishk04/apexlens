import { isAllowedSalesforceDomain, fetchLogEntryPoint, API_VERSION } from '../api/salesforce';

describe('isAllowedSalesforceDomain (confused-deputy guard)', () => {
  it('allows real Salesforce host patterns over https', () => {
    expect(isAllowedSalesforceDomain('https://foo.my.salesforce.com')).toBe(true);
    expect(isAllowedSalesforceDomain('https://foo.lightning.force.com')).toBe(true);
    expect(isAllowedSalesforceDomain('https://foo.my.salesforce-setup.com')).toBe(true);
    expect(isAllowedSalesforceDomain('https://foo.sandbox.my.salesforce.com')).toBe(true);
  });

  it('rejects an attacker-supplied domain', () => {
    expect(isAllowedSalesforceDomain('https://evil.example.com')).toBe(false);
    // Lookalike domain — "salesforce.com" only as a path/subdomain suffix trick.
    expect(isAllowedSalesforceDomain('https://salesforce.com.evil.example.com')).toBe(false);
    expect(isAllowedSalesforceDomain('https://not-salesforce.com')).toBe(false);
  });

  it('rejects non-https schemes even for a real host', () => {
    expect(isAllowedSalesforceDomain('http://foo.my.salesforce.com')).toBe(false);
  });

  it('fails closed on malformed input rather than throwing', () => {
    expect(isAllowedSalesforceDomain('not a url')).toBe(false);
    expect(isAllowedSalesforceDomain('')).toBe(false);
  });
});

/**
 * Builds a Response whose body streams `chunks` one read at a time, and reports
 * how many were actually pulled. That count is the whole point: it proves the
 * scan stops early instead of draining a multi-megabyte body.
 */
function streamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const state = { pulled: 0, cancelled: false };
  let i = 0;

  const body = {
    getReader() {
      return {
        async read() {
          if (i >= chunks.length) return { done: true, value: undefined };
          state.pulled++;
          return { done: false, value: encoder.encode(chunks[i++]!) };
        },
        async cancel() {
          state.cancelled = true;
        },
      };
    },
  };

  return { state, response: { ok: true, status: 200, statusText: 'OK', body } };
}

const HEADER = '67.0 APEX_CODE,FINEST\n';
const ENTRY =
  '17:19:47.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|apex://STS_GeneralUtilityS360/ACTION$getAllSizes\n';

describe('fetchLogEntryPoint', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('stops reading once the entry point is found', async () => {
    // The entry point is in chunk 2; chunks 3..12 stand in for megabytes of log.
    const filler = Array.from({ length: 10 }, () => '17:19:47.0 (3000000)|HEAP_ALLOCATE|Bytes:8\n');
    const { state, response } = streamingResponse([HEADER, ENTRY, ...filler]);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L1');

    expect(result.entry).toEqual({
      type: 'Apex',
      className: 'STS_GeneralUtilityS360',
      methodName: 'getAllSizes',
    });
    // Two chunks pulled, ten left untouched — the transfer was abandoned.
    expect(state.pulled).toBe(2);
    expect(state.cancelled).toBe(true);
  });

  it('reports how many bytes it actually read', async () => {
    // The whole point of the number: it is what proves the bound is real rather
    // than assumed, so it must count only what was pulled, not what was offered.
    const filler = Array.from({ length: 10 }, () => 'x'.repeat(1000) + '\n');
    const { response } = streamingResponse([HEADER, ENTRY, ...filler]);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L1');

    expect(result.bytesRead).toBe(HEADER.length + ENTRY.length);
    expect(result.bytesRead).toBeLessThan(1000);
  });

  it('gives up at the 64 KB scan limit when a log has no code unit', async () => {
    // 100 chunks of 1 KB, none of them a code unit. Without the cap this would
    // drain the whole body looking for something that is not there.
    const noise = Array.from({ length: 100 }, () => 'y'.repeat(1024) + '\n');
    const { state, response } = streamingResponse(noise);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L1');

    expect(result.entry).toBeNull();
    expect(result.bytesRead).toBeLessThanOrEqual(64 * 1024 + 1025);
    expect(state.pulled).toBeLessThan(noise.length);
  });

  it('asks for a byte range and reports whether the server honoured it', async () => {
    const { response } = streamingResponse([HEADER, ENTRY]);
    const fetchMock = jest.fn().mockResolvedValue({ ...response, status: 206 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid-123', '07L9');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `https://x.my.salesforce.com/services/data/${API_VERSION}/tooling/sobjects/ApexLog/07L9/Body`,
    );
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer sid-123',
      Range: 'bytes=0-65535',
    });
    // 206: the server bounded the transfer for us.
    expect(result.ranged).toBe(true);
  });

  it('treats a 200 as the normal case — Range support is a bonus, not a dependency', async () => {
    const { response } = streamingResponse([HEADER, ENTRY]);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L1');
    expect(result.ranged).toBe(false);
    expect(result.entry?.className).toBe('STS_GeneralUtilityS360');
  });

  it('skips a bare phase-boundary marker CODE_UNIT_STARTED and keeps reading for the real one', async () => {
    // Reported from a real log: it opens with `CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS`,
    // a marker with no class or method, before the real entry point moments later.
    const marker = '17:16:27.0 (166224)|CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS\n';
    const real =
      '17:16:29.183 (2183528434)|CODE_UNIT_STARTED|[EXTERNAL]|01p2x000007kDtu|STS_CreateLocations.createLocation(List<Id>)\n';
    const { response } = streamingResponse([HEADER, marker, real]);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L5');
    expect(result.entry).toEqual({
      type: 'Apex',
      className: 'STS_CreateLocations',
      methodName: 'createLocation',
    });
  });

  it('falls back to the marker if nothing more meaningful turns up before the scan limit', async () => {
    const marker = '17:16:27.0 (166224)|CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS\n';
    const noise = Array.from({ length: 100 }, () => 'y'.repeat(1024) + '\n');
    const { response } = streamingResponse([HEADER, marker, ...noise]);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L6');
    expect(result.entry).toEqual({ type: 'Unknown', className: 'TRIGGERS', methodName: '' });
  });

  it('resolves a record-triggered flow to its real name, not the object it fired on', async () => {
    // Reported from a real log: CODE_UNIT_STARTED|[EXTERNAL]|Flow:Case reads as
    // "Flow / Case", which is just the SObject — the real flow name is on
    // FLOW_CREATE_INTERVIEW_END moments later.
    const flowWrapper = '20:16:33.0 (446835)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Case\n';
    const createEnd =
      '20:16:33.55 (55830928)|FLOW_CREATE_INTERVIEW_END|5121e8856474d32711aa333d8b7019fae36fb3b-3f3d|Case_Update_Pilot_From_Owner\n';
    const { response } = streamingResponse([HEADER, flowWrapper, createEnd]);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L7');
    expect(result.entry).toEqual({
      type: 'Flow',
      className: 'Case_Update_Pilot_From_Owner',
      methodName: '',
    });
  });

  it('falls back to the object-named Flow wrapper if no real name turns up before the scan limit', async () => {
    const flowWrapper = '20:16:33.0 (446835)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Case\n';
    const noise = Array.from({ length: 100 }, () => 'y'.repeat(1024) + '\n');
    const { response } = streamingResponse([HEADER, flowWrapper, ...noise]);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L8');
    expect(result.entry).toEqual({ type: 'Flow', className: 'Case', methodName: '' });
  });

  it('returns no entry when the log has no code unit, rather than throwing', async () => {
    const { response } = streamingResponse([HEADER, '17:19:47.0 (1)|LIMIT_USAGE|[1]|SOQL|1|100\n']);
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L2');
    expect(result.entry).toBeNull();
  });

  it('falls back to reading the whole body when streaming is unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: null,
      text: async () => HEADER + ENTRY,
    }) as unknown as typeof fetch;

    const result = await fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L3');
    expect(result.entry?.className).toBe('STS_GeneralUtilityS360');
    // Reports the full cost of the fallback instead of pretending it was bounded.
    expect(result.bytesRead).toBe((HEADER + ENTRY).length);
  });

  it('surfaces an HTTP failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      body: null,
    }) as unknown as typeof fetch;

    await expect(
      fetchLogEntryPoint('https://x.my.salesforce.com', 'sid', '07L4'),
    ).rejects.toThrow(/401/);
  });

  it('returns immediately when the caller has already aborted', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();

    const result = await fetchLogEntryPoint(
      'https://x.my.salesforce.com',
      'sid',
      '07L5',
      controller.signal,
    );
    expect(result.entry).toBeNull();
    expect(result.bytesRead).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
