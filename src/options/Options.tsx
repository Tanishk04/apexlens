import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Database, Sun, Moon } from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  ENTRY_CACHE_KEY,
  SUSPEND_KEY,
  readSettings,
  readSuspendState,
  writeSettings,
  type Settings,
  type SuspendState,
} from '../settings';
import { useTheme } from '../app/utils/theme';
import '../index.css';

const KB = 1024;

function formatBytes(bytes: number): string {
  if (bytes >= KB * KB) return `${(bytes / KB / KB).toFixed(1)} MB`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${bytes} bytes`;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/40 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

const Options = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [suspend, setSuspend] = useState<SuspendState>({ suspended: false, averageBytes: 0 });
  const [cacheCount, setCacheCount] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();

  const loadCacheCount = useCallback(async () => {
    try {
      const stored = await chrome.storage.local.get(ENTRY_CACHE_KEY);
      setCacheCount(Object.keys((stored[ENTRY_CACHE_KEY] as object | undefined) ?? {}).length);
    } catch {
      setCacheCount(0);
    }
  }, []);

  useEffect(() => {
    readSettings().then(setSettings);
    readSuspendState().then(setSuspend);
    loadCacheCount();
  }, [loadCacheCount]);

  const update = async (patch: Partial<Settings>) => {
    try {
      setSettings(await writeSettings(patch));
      setSaveError(null);
    } catch {
      // Never leave a checkbox showing a state that was not saved — a user who
      // sees "off" but is still being charged for requests has been misled.
      // Re-read what is actually stored and say so.
      setSettings(await readSettings());
      setSaveError('Could not save — your browser refused to write extension storage.');
    }
  };

  const clearCache = async () => {
    try {
      await chrome.storage.local.remove(ENTRY_CACHE_KEY);
    } catch {
      // Nothing to report beyond the count refusing to move.
    }
    loadCacheCount();
  };

  /** Clearing the suspend flag lets the byte budget re-measure from scratch. */
  const retryAfterSuspend = async () => {
    try {
      await chrome.storage.local.remove(SUSPEND_KEY);
      setSuspend({ suspended: false, averageBytes: 0 });
    } catch {
      setSaveError('Could not clear the paused state.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl p-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">ApexLens Settings</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Version {chrome.runtime?.getManifest?.().version ?? '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </header>

        {suspend.suspended ? (
          <div className="mb-5 rounded-lg border border-warn/40 bg-warn/10 p-4">
            <p className="flex items-start gap-2 text-sm text-validation">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-medium">Entry-point lookups paused automatically.</strong>
                <br />
                Each lookup should read a few KB, but this org averaged{' '}
                <strong>{formatBytes(suspend.averageBytes)}</strong> per log — the request could not
                be cut short, so continuing would download far more than the columns are worth.
              </span>
            </p>
            <button
              type="button"
              onClick={retryAfterSuspend}
              className="mt-3 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
            >
              Try again
            </button>
          </div>
        ) : null}

        {saveError ? (
          <p className="mb-4 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
            {saveError}
          </p>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Debug Logs list
          </h2>

          <Toggle
            checked={settings.entryColumns}
            onChange={(v) => update({ entryColumns: v })}
            label="Show Type / Class / Method columns"
            description="Adds columns to Setup ▸ Debug Logs naming the Apex class, trigger or flow behind each log. Turning this off stops all extra network requests on that page."
          />

          <Toggle
            checked={settings.autoResolve}
            disabled={!settings.entryColumns}
            onChange={(v) => update({ autoResolve: v })}
            label="Fill columns automatically"
            description="Looks up rows as they scroll into view. With this off, each row gets a Resolve button instead — nothing is fetched until you ask."
          />

          <Toggle
            checked={settings.respectSaveData}
            disabled={!settings.entryColumns}
            onChange={(v) => update({ respectSaveData: v })}
            label="Pause on slow or metered connections"
            description="Honours the browser's Data Saver setting and backs off on 2G/3G, switching to Resolve buttons instead of fetching automatically."
          />

          <Toggle
            checked={settings.notifyNewLogs}
            onChange={(v) => update({ notifyNewLogs: v })}
            label="Notify about new logs"
            description="Off by default. The Debug Logs page never updates on its own — Salesforce renders it once and never checks again. When on, every 20s asks for the newest log ids (never a log body) and shows a Refresh banner if one isn't on the page yet."
          />

          <Toggle
            checked={settings.manualRefreshButton}
            onChange={(v) => update({ manualRefreshButton: v })}
            label="Manual refresh button"
            description="A ⟳ button on the Debug Logs list to refresh it on demand. No polling, no network call of its own — independent of the notification setting above."
          />
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cache
          </h2>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Database size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong className="text-foreground">{cacheCount.toLocaleString()}</strong> logs
                remembered. Debug logs never change once written, so a cached result stays correct
                forever and costs no network.
              </span>
            </p>
            <button
              type="button"
              onClick={clearCache}
              disabled={cacheCount === 0}
              className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear cache
            </button>
          </div>
        </section>

        <p className="mt-6 text-xs text-muted-foreground/70">
          ApexLens has no server. Log data is read from your own org with your own session and never
          leaves your browser, except for the AI analysis you explicitly run.
        </p>
      </div>
    </div>
  );
};

// Reuse a single root across HMR updates, matching src/app/App.tsx — otherwise
// each dev reload creates a second root over the same container.
const container = document.getElementById('root')!;
const w = window as unknown as { __sfdaOptionsRoot?: ReturnType<typeof createRoot> };
const root = w.__sfdaOptionsRoot ?? (w.__sfdaOptionsRoot = createRoot(container));
root.render(<Options />);
