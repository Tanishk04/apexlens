/**
 * User settings, owned in one place.
 *
 * The content script, the background worker and the options page all read and
 * write these. Three copies of a defaults object would drift, and a drifted
 * default here means the extension quietly fetches when the user asked it not
 * to — so defaults, keys and the shape live here and nowhere else.
 *
 * Stored in `chrome.storage.local`, deliberately separate from the entry-point
 * cache: clearing a cache that has grown large must never reset preferences.
 */

export interface Settings {
  /** Master switch for the Type/Class/Method columns on the Debug Logs list. */
  entryColumns: boolean;
  /** Resolve rows as they scroll into view, vs. only when the user clicks. */
  autoResolve: boolean;
  /** Stand down on metered or slow connections. */
  respectSaveData: boolean;
  /**
   * Poll for new debug logs while the Setup ▸ Debug Logs page is open, and
   * show a "N new logs — Refresh" banner. The page itself never updates on
   * its own — Classic's list is rendered once, server-side, with nothing
   * watching for new rows — so without this a genuinely new log is invisible
   * until the user thinks to reload. The poll only asks for log *ids*
   * (`SELECT Id FROM ApexLog ORDER BY StartTime DESC`), never a log body.
   * Default off — an unasked-for background poll on someone else's org is
   * exactly the kind of thing that makes a user distrust and uninstall.
   */
  notifyNewLogs: boolean;
  /**
   * A manual refresh button on the Debug Logs list, independent of
   * notifyNewLogs — no polling, no network call of its own, just a reload of
   * this frame on click. Its own checkbox because someone may want on-demand
   * refresh without opting into the background poll.
   */
  manualRefreshButton: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  entryColumns: true,
  autoResolve: true,
  respectSaveData: true,
  notifyNewLogs: false,
  manualRefreshButton: true,
};

export const SETTINGS_KEY = 'sfda_settings';
/**
 * Entry-point lookup cache. Named here so "clear cache" cannot target the
 * wrong key. ApexLog bodies are immutable, so a cached result is assumed
 * good forever — but that assumption only holds while the *code* that
 * produced it hasn't changed. A bug fix to how we parse a payload (e.g. the
 * "TRIGGERS" phase-marker fix, trigger methodName now showing just the DML
 * operation, or a Flow entry now resolving to its real name instead of the
 * object it fired on) doesn't change the log, so the old cache would
 * otherwise keep serving the pre-fix answer forever with no way for the user
 * to know to clear it. The `_v3` suffix is a version bump: bump it again
 * whenever `parseEntryPoint`/`isMeaningfulEntryPoint`/`refineFlowEntryPoint`
 * output changes in a way that would make an old cached entry wrong, and the
 * old entries are simply abandoned under their old key rather than needing
 * a migration.
 */
export const ENTRY_CACHE_KEY = 'sfda_entry_points_v3';
/** Last version whose release note the user has seen, for the ⓘ chip's unread dot. */
export const LAST_SEEN_VERSION_KEY = 'sfda_last_seen_version';

/**
 * Set when the measured read bound turns out not to hold on this org — see the
 * byte budget in `src/background/index.ts`. Persisted so the decision survives
 * the service worker being torn down, which happens constantly in MV3.
 */
export interface SuspendState {
  suspended: boolean;
  /** Observed average bytes per lookup that triggered it, for an honest message. */
  averageBytes: number;
}

export const SUSPEND_KEY = 'sfda_entry_suspended';

export async function readSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    const value = stored[SETTINGS_KEY] as Partial<Settings> | undefined;
    // Spread over defaults rather than replacing: a settings object written by
    // an older version is missing keys added since, and those must not read as
    // `undefined` (falsy) and silently disable a feature.
    return { ...DEFAULT_SETTINGS, ...(value ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await readSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function readSuspendState(): Promise<SuspendState> {
  try {
    const stored = await chrome.storage.local.get(SUSPEND_KEY);
    return (stored[SUSPEND_KEY] as SuspendState | undefined) ?? { suspended: false, averageBytes: 0 };
  } catch {
    return { suspended: false, averageBytes: 0 };
  }
}

export async function writeSuspendState(state: SuspendState): Promise<void> {
  try {
    await chrome.storage.local.set({ [SUSPEND_KEY]: state });
  } catch {
    // Storage unavailable — the in-memory decision still applies for this session.
  }
}
