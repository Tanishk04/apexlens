import { StreamScanner, Lexer } from '../parser';
import { parseEntryPoint, isMeaningfulEntryPoint, refineFlowEntryPoint, type EntryPoint } from '../entryPoint';

function readCookie(
  getCookie: (callback: (cookie: chrome.cookies.Cookie | null) => void) => void
): Promise<string | null> {
  return new Promise((resolve) => {
    getCookie((cookie) => {
      if (chrome.runtime.lastError) {
        console.warn('Cookie lookup failed:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(cookie?.value ?? null);
    });
  });
}

/**
 * Fetches the active Session ID for a given Salesforce domain.
 */
export async function getSessionId(domain: string): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.cookies) {
    console.warn('chrome.cookies API is not available.');
    return null;
  }

  const url = domain.endsWith('/') ? domain : `${domain}/`;
  const hostname = new URL(url).hostname;

  const byUrl = await readCookie((callback) => {
    chrome.cookies.get({ url, name: 'sid' }, callback);
  });
  if (byUrl) return byUrl;

  return readCookie((callback) => {
    chrome.cookies.getAll({ domain: hostname, name: 'sid' }, (cookies) => {
      callback(cookies[0] ?? null);
    });
  });
}

// Suffixes matching this extension's own host_permissions (manifest.json) — the
// only domains the extension is actually granted cookie/fetch access to. Used to
// validate `domain` before it's used to read cookies or fetch a log body, since
// that value can arrive via a URL query param (see App.tsx) and must not be
// trusted blindly.
const ALLOWED_HOST_SUFFIXES = ['.salesforce.com', '.force.com', '.salesforce-setup.com'];

/** Is `domain` (an origin string, e.g. `https://foo.my.salesforce.com`) one this
 * extension actually has host permission for? Fails closed on anything else,
 * including malformed URLs and non-https schemes. */
export function isAllowedSalesforceDomain(domain: string): boolean {
  try {
    const url = new URL(domain);
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname;
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

/** Tooling API version used for every ApexLog request. */
export const API_VERSION = 'v61.0';

function logBodyUrl(domain: string, logId: string): string {
  return `${domain}/services/data/${API_VERSION}/tooling/sobjects/ApexLog/${logId}/Body`;
}

/**
 * The most recent ApexLog ids in the org, newest first — used to detect logs
 * that exist server-side but haven't appeared on the (never auto-refreshing)
 * Debug Logs list yet. Asks for ids only, never a log body: this is metadata,
 * not the potentially-sensitive log content itself.
 */
export async function fetchRecentLogIds(
  domain: string,
  sessionId: string,
  limit: number,
): Promise<string[]> {
  const query = `SELECT Id FROM ApexLog ORDER BY StartTime DESC LIMIT ${limit}`;
  const url = `${domain}/services/data/${API_VERSION}/tooling/query/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${sessionId}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch recent logs: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { records?: { Id?: string }[] };
  return (data.records ?? []).map((r) => r.Id).filter((id): id is string => Boolean(id));
}

/**
 * Downloads the raw body of a specific debug log.
 */
export async function fetchLogBody(domain: string, sessionId: string, logId: string): Promise<string> {
  const response = await fetch(logBodyUrl(domain, logId), {
    headers: {
      'Authorization': `Bearer ${sessionId}`,
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch log body: ${response.statusText}`);
  }

  return await response.text();
}

/**
 * Hard ceiling on how much of a log body we will read looking for the entry
 * point. In every log examined the first CODE_UNIT_STARTED is line 3, a few
 * hundred bytes in; 64 KB is already a wide margin, and only matters for the
 * pathological case of a log that has no code unit at all.
 */
const ENTRY_POINT_SCAN_LIMIT = 64 * 1024;

/** Byte range we ask for. Matches the scan limit — asking for more would be pointless. */
const RANGE_HEADER = `bytes=0-${ENTRY_POINT_SCAN_LIMIT - 1}`;

export interface EntryPointResult {
  entry: EntryPoint | null;
  /**
   * Bytes actually read off the wire. The caller uses this to check that the
   * bound below is real rather than assumed — see the byte budget in
   * `src/background/index.ts`.
   */
  bytesRead: number;
  /** True when the server honoured our Range request and bounded this itself. */
  ranged: boolean;
}

/**
 * Read just far enough into a log to identify what started it.
 *
 * The Debug Logs list needs one field per row, but ApexLog bodies run to
 * megabytes — the reference logs are ~3 MB each and 20 MB is legal. Fetching
 * whole bodies to read their first line would cost more than the column is
 * worth, especially on a slow connection. Three defences, weakest last:
 *
 *  1. Ask for `Range: bytes=0-65535`. If Salesforce honours it the bound is
 *     server-side and nothing else matters. This is undocumented for the ApexLog
 *     Body endpoint, so it is treated as a bonus, never a dependency.
 *  2. Stream the response and abort at the first *meaningful* CODE_UNIT_STARTED
 *     (see `isMeaningfulEntryPoint`) — some logs open with a bare phase-boundary
 *     marker like `CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS` before the real entry
 *     point, and stopping unconditionally at the first one would show that
 *     marker instead. The first one found is kept as a fallback in case nothing
 *     more meaningful turns up before the budget runs out. A record-triggered
 *     Flow entry point (`Flow:<Object>`) is a second case of this same shape —
 *     structurally meaningful but not actually specific — so once one is found,
 *     scanning continues (still bounded by the same budget) for the real flow
 *     name (see `refineFlowEntryPoint`) before returning.
 *  3. Give up at ENTRY_POINT_SCAN_LIMIT regardless.
 *
 * Because (2) depends on the browser and server actually ending the transfer, we
 * report `bytesRead` rather than trusting it: if the bound turns out not to hold
 * on a real org, the caller can see that and stand down.
 *
 * Chunks are fed to the same StreamScanner/Lexer the full parser uses, so line
 * splitting and tokenisation stay in one place and cannot drift.
 *
 * `entry` is null when the log contains no CODE_UNIT_STARTED within the scan
 * limit (a limits-only or truncated log) — the caller shows a blank cell, not an
 * error.
 */
export async function fetchLogEntryPoint(
  domain: string,
  sessionId: string,
  logId: string,
  signal?: AbortSignal,
): Promise<EntryPointResult> {
  const controller = new AbortController();
  // Caller-driven cancellation (row scrolled away, page navigated) has to
  // compose with our own early abort.
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) return { entry: null, bytesRead: 0, ranged: false };
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let bytesRead = 0;

  try {
    const response = await fetch(logBodyUrl(domain, logId), {
      headers: { Authorization: `Bearer ${sessionId}`, Range: RANGE_HEADER },
      signal: controller.signal,
    });

    // 206 means the server bounded it for us. 200 means it ignored the Range and
    // is sending the whole body — expected, and why the stream-abort path exists.
    const ranged = response.status === 206;

    if (!response.ok) {
      throw new Error(`Failed to fetch log body: ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      // No streaming available (older runtime, or a mocked response): fall back
      // to reading the whole body. Correct, just not cheap — and the byte count
      // reflects that honestly rather than reporting the bound we wanted.
      const text = await response.text();
      return { entry: entryPointFromText(text), bytesRead: text.length, ranged };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const scanner = new StreamScanner();
    const lexer = new Lexer();
    let fallback: EntryPoint | null = null;
    // A meaningful Flow:<Object> entry is kept here rather than returned right
    // away, so scanning can continue (still within the same budget) looking
    // for the real flow name — see refineFlowEntryPoint.
    let candidate: EntryPoint | null = null;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;

        for (const line of scanner.pushChunk(decoder.decode(value, { stream: true }))) {
          const token = lexer.tokenize(line);
          if (!token) continue;

          if (candidate) {
            const refined = refineFlowEntryPoint(candidate, token.event, token.payload);
            if (refined !== candidate) return { entry: refined, bytesRead, ranged };
            continue;
          }

          if (token.event === 'CODE_UNIT_STARTED') {
            const entry = parseEntryPoint(token.payload);
            if (isMeaningfulEntryPoint(entry)) {
              if (entry.type !== 'Flow') return { entry, bytesRead, ranged };
              candidate = entry;
            } else if (!fallback) {
              fallback = entry;
            }
          }
        }

        if (bytesRead >= ENTRY_POINT_SCAN_LIMIT) break;
      }
    } finally {
      // Stops the transfer; without this the browser keeps pulling the body we
      // have already stopped caring about.
      controller.abort();
      reader.cancel().catch(() => {});
    }

    return { entry: candidate ?? fallback, bytesRead, ranged };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { entry: null, bytesRead, ranged: false };
    }
    throw err;
  } finally {
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/** Non-streaming fallback: scan already-materialised text for the entry point. */
function entryPointFromText(text: string): EntryPoint | null {
  const scanner = new StreamScanner();
  const lexer = new Lexer();
  let fallback: EntryPoint | null = null;
  // See the streaming path above: a meaningful Flow:<Object> entry is held
  // here so scanning can continue for the real flow name.
  let candidate: EntryPoint | null = null;

  const check = (line: string): EntryPoint | undefined => {
    const token = lexer.tokenize(line);
    if (!token) return undefined;

    if (candidate) {
      const refined = refineFlowEntryPoint(candidate, token.event, token.payload);
      if (refined !== candidate) return refined;
      return undefined;
    }

    if (token.event !== 'CODE_UNIT_STARTED') return undefined;
    const entry = parseEntryPoint(token.payload);
    if (isMeaningfulEntryPoint(entry)) {
      if (entry.type !== 'Flow') return entry;
      candidate = entry;
      return undefined;
    }
    if (!fallback) fallback = entry;
    return undefined;
  };

  for (const line of scanner.pushChunk(text)) {
    const entry = check(line);
    if (entry) return entry;
  }
  const last = scanner.finish();
  if (last !== null) {
    const entry = check(last);
    if (entry) return entry;
  }
  return candidate ?? fallback;
}
