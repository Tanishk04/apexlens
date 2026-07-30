import React from 'react';
import { FolderOpen, Sun, Moon, Settings, Command } from 'lucide-react';
import type { LogMetrics } from '../../types';
import { shortcutLabel } from '../utils/platform';

/**
 * ApexLens mark: a two-element "peak + dot" shape — matches
 * branding/ApexLens/SVG/mark-transparent.svg exactly. This previously hand-drew
 * an unrelated "magnifying glass + A" design that appeared nowhere else in the
 * repo's branding assets and cited a `mark-simple.svg` that doesn't exist.
 */
const ApexLensMark = () => (
  <svg viewBox="0 0 512 512" width="16" height="16" aria-hidden="true">
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M 92 418 L 256 130 L 420 418" stroke="#2563EB" strokeWidth="66" />
      <circle cx="256" cy="130" r="42" fill="#3B82F6" stroke="none" />
    </g>
  </svg>
);

export interface LogMeta {
  name: string;
  sizeBytes: number;
  parseMs: number;
}

interface Props {
  meta: LogMeta | null;
  metrics: LogMetrics | null;
  issues: number;
  theme: string;
  onToggleTheme: () => void;
  onOpenFile: (file: File) => void;
  onOpenPalette: () => void;
  onIssuesClick: () => void;
  onOpenSettings: () => void;
}

const iconBtn =
  'flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

export const AppHeader = ({
  meta,
  metrics,
  issues,
  theme,
  onToggleTheme,
  onOpenFile,
  onOpenPalette,
  onIssuesClick,
  onOpenSettings,
}: Props) => {
  return (
    <div className="shrink-0 border-b border-border bg-background">
      {/* logo bar */}
      <div className="flex h-11 items-center justify-between gap-4 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="flex rounded-md bg-[#0F172A] p-1.5">
            <ApexLensMark />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">ApexLens</span>
        </div>

        <div className="flex items-center gap-2">
          <label title="Open a downloaded .log file" className={`${iconBtn} cursor-pointer`}>
            <FolderOpen size={13} /> Open log
            <input
              type="file"
              accept=".log,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onOpenFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={iconBtn}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            type="button"
            onClick={onOpenPalette}
            title={`Command palette (${shortcutLabel('K')})`}
            className={iconBtn}
          >
            <Command size={13} />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings"
            className={iconBtn}
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* info strip */}
      {meta ? (
        <div className="flex h-9 items-center gap-2 px-4 text-xs">
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-foreground">
            {meta.name}
          </span>
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-muted-foreground">
            {(meta.sizeBytes / 1024 / 1024).toFixed(2)} MB
          </span>
          <span
            className="rounded-md border border-border px-2 py-0.5 font-mono text-muted-foreground"
            title="Parse time"
          >
            {(meta.parseMs / 1000).toFixed(3)} s
          </span>
          <button
            type="button"
            onClick={onIssuesClick}
            disabled={issues === 0}
            title={issues > 0 ? 'Jump to next issue' : 'No issues detected'}
            className={`rounded-md px-2 py-0.5 font-medium ${
              issues > 0
                ? 'bg-error/15 text-error hover:bg-error/25'
                : 'bg-soql/15 text-soql'
            }`}
          >
            {issues} issue{issues === 1 ? '' : 's'}
          </button>

          {metrics ? (
            <span className="ml-auto flex items-center gap-3 font-mono text-muted-foreground">
              <span>SOQL {metrics.totalSoql}</span>
              <span>DML {metrics.totalDml}</span>
              <span>Rows {metrics.totalDmlRows}</span>
              {metrics.cpuTimeMs > 0 ? <span>CPU {metrics.cpuTimeMs}ms</span> : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
