import { getSessionId, fetchLogEntryPoint, fetchRecentLogIds, isAllowedSalesforceDomain } from '../api/salesforce';
import type { EntryPoint } from '../entryPoint';
import {
  ENTRY_CACHE_KEY,
  readSuspendState,
  writeSuspendState,
  type SuspendState,
} from '../settings';

/**
 * Maps setup-domain origins to the API-capable My-Domain origin. The Debug
 * Logs setup page can live on *.salesforce-setup.com, whose cookies/API are
 * on the matching *.salesforce.com host.
 */
function apiDomainFor(origin: string): string {
  return origin.replace('.salesforce-setup.com', '.salesforce.com');
}

/**
 * Where to open the analyzer tab.
 *
 * Targeting the sender's own window matters twice over. In a private window the
 * analyzer must land *in that window*, or it opens against a different profile
 * whose cookie jar has no Salesforce session — which is exactly how "Session not
 * found" used to appear to a user who was plainly logged in. And with several
 * normal windows open, omitting the id let Chrome pick whichever it last
 * focused, so the tab could appear on another screen entirely.
 *
 * Falls back to letting Chrome choose when there is no sender tab (the toolbar
 * action, for instance).
 */
export function tabCreateOptions(
  url: string,
  sender?: chrome.runtime.MessageSender,
): chrome.tabs.CreateProperties {
  const windowId = sender?.tab?.windowId;
  return windowId === undefined ? { url } : { url, windowId };
}

// Content script (Debug Logs page) asks us to open the analyzer for a log.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openAppTab') {
    const domain = apiDomainFor(message.domain as string);
    const appUrl = chrome.runtime.getURL(
      `src/app/index.html?logId=${message.logId}&domain=${encodeURIComponent(domain)}`,
    );
    chrome.tabs.create(tabCreateOptions(appUrl, sender));
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'getEntryPoints') {
    // Returning true keeps the message channel open for the async reply; without
    // it the content script's callback fires with undefined.
    resolveEntryPoints(
      message.logIds as string[],
      message.domain as string,
      (message.concurrency as number | undefined) ?? CONCURRENCY,
      sender.tab?.incognito === true,
    )
      .then(({ entries, suspend }) => sendResponse({ ok: true, entries, suspend }))
      .catch((err: unknown) => {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      });
    return true;
  }

  if (message.action === 'getRecentLogIds') {
    const domain = apiDomainFor(message.domain as string);
    (async () => {
      const sessionId = await getSessionId(domain);
      if (!sessionId) {
        sendResponse({ ok: false, error: 'No session' });
        return;
      }
      try {
        const ids = await fetchRecentLogIds(domain, sessionId, (message.limit as number | undefined) ?? 10);
        sendResponse({ ok: true, ids });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  }

  if (message.action === 'openOptions') {
    // Content scripts cannot call this directly.
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// Toolbar icon (no popup): open the analyzer standalone — user can Open a
// downloaded .log file from there.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html') });
});

/** `null` = looked up, and this log genuinely has no code unit. */
type CachedEntry = { entry: EntryPoint | null; at: number };

const CACHE_KEY = ENTRY_CACHE_KEY;
/** Bounds storage. Well past a Setup page's worth of rows, small enough to stay cheap. */
const CACHE_LIMIT = 500;
/**
 * Concurrent body reads. Each is aborted within a few KB, but these run against
 * the user's org on their session — this is deliberately polite, not maximal.
 */
const CONCURRENCY = 4;

/**
 * Average bytes per lookup above which we conclude the read bound is not
 * holding on this org.
 *
 * `fetchLogEntryPoint` asks for a 64 KB range and aborts at the first code unit,
 * which should put a normal lookup in the low kilobytes. If the average lands
 * far above that, neither defence is working — the server ignored the Range and
 * the abort is not ending the transfer — and each row is costing a full body.
 * That is the case this feature must not inflict on a slow connection, so rather
 * than trusting the mechanism we measure it and stand down.
 *
 * Set well above the expected figure so ordinary variance cannot trip it.
 */
const BYTE_BUDGET_PER_LOOKUP = 256 * 1024;
/** Don't judge on one sample; a single odd log should not disable the feature. */
const BUDGET_MIN_SAMPLES = 3;

let observedBytes = 0;
let observedLookups = 0;

async function readCache(): Promise<Record<string, CachedEntry>> {
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    return (stored[CACHE_KEY] as Record<string, CachedEntry> | undefined) ?? {};
  } catch {
    // A cache failure must never break the feature — just refetch.
    return {};
  }
}

async function writeCache(cache: Record<string, CachedEntry>): Promise<void> {
  const keys = Object.keys(cache);
  let toStore = cache;
  if (keys.length > CACHE_LIMIT) {
    // Keep the most recently resolved. ApexLog bodies are immutable, so eviction
    // only ever costs a refetch, never correctness.
    const newest = keys
      .sort((a, b) => (cache[b]?.at ?? 0) - (cache[a]?.at ?? 0))
      .slice(0, CACHE_LIMIT);
    toStore = Object.fromEntries(newest.map((k) => [k, cache[k]!]));
  }
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: toStore });
  } catch {
    // Over quota or storage unavailable — the lookups still succeeded.
  }
}

/**
 * Resolve the entry point for each log id, preferring cache.
 *
 * ApexLog bodies never change once written, so a hit is permanently valid — the
 * common case (revisiting or re-sorting the Debug Logs list) costs no network at
 * all. Misses are fetched a few at a time and stream-aborted after the first
 * code unit, so a page of rows does not pull megabytes.
 */
async function resolveEntryPoints(
  logIds: string[],
  origin: string,
  concurrency: number,
  incognito: boolean,
): Promise<{ entries: Record<string, EntryPoint | null>; suspend: SuspendState }> {
  const domain = apiDomainFor(origin);
  // Same allowlist that guards the app page: a compromised content script must
  // not be able to aim a cookie-authenticated fetch at an arbitrary host.
  if (!isAllowedSalesforceDomain(domain)) {
    throw new Error('Unrecognized Salesforce domain — refusing to fetch.');
  }

  const cache = await readCache();
  const result: Record<string, EntryPoint | null> = {};
  const missing: string[] = [];

  for (const id of logIds) {
    const hit = cache[id];
    if (hit) result[id] = hit.entry;
    else missing.push(id);
  }

  let suspend = await readSuspendState();
  // Cache hits cost nothing, so serve them even while suspended — suspension is
  // about not making more requests, not about hiding data already held.
  if (missing.length === 0 || suspend.suspended) return { entries: result, suspend };

  const sessionId = await getSessionId(domain);
  if (!sessionId) throw new Error('No Salesforce session found for this org.');

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= missing.length) return;
      // Stop pulling new work the moment the budget check trips, so a bad org
      // costs a few lookups rather than the whole visible page.
      if (overBudget()) return;
      const id = missing[index]!;
      try {
        const { entry, bytesRead } = await fetchLogEntryPoint(domain, sessionId, id);
        observedBytes += bytesRead;
        observedLookups++;
        result[id] = entry;
        cache[id] = { entry, at: Date.now() };
      } catch {
        // One unreadable log must not fail the batch — that row shows a dash.
        result[id] = null;
      }
    }
  });
  await Promise.all(workers);

  if (overBudget()) {
    suspend = {
      suspended: true,
      averageBytes: Math.round(observedBytes / Math.max(1, observedLookups)),
    };
    await writeSuspendState(suspend);
  }

  // Split mode gives the incognito session its own process and cookie jar, but
  // NOT its own storage — chrome.storage.local is shared with the normal
  // profile. Persisting here would leave a durable record of which logs, and so
  // which Apex classes, someone looked at in a private window. Reads above stay
  // allowed: serving an existing entry records nothing new.
  if (!incognito) await writeCache(cache);
  return { entries: result, suspend };
}

/**
 * Has the measured cost per lookup exceeded what the bound promises? Requires a
 * few samples first so one unusual log cannot disable the feature.
 */
function overBudget(): boolean {
  if (observedLookups < BUDGET_MIN_SAMPLES) return false;
  return observedBytes / observedLookups > BYTE_BUDGET_PER_LOOKUP;
}
