# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-07-13

First public release.

### Added

- **Registry-driven Apex log parser** covering all 9 Salesforce trace-flag categories, off-main-thread
  via a Web Worker, tolerant of unknown/future event names (falls back to a generic node instead of
  breaking).
- **Execution Tree** — collapsible call tree with multi-type filtering, in-app find, jump-to-raw-line.
- **Execution Timeline** — canvas flame chart with bounded pan/zoom, a minimap (click/drag-to-seek),
  hover tooltips, error-first navigation to the first exception.
- **Governor Dashboard** — limit usage at a glance, SOQL/DML/Rows/CPU.
- **SOQL / DML / Flow Analysis** tables with per-column filtering.
- **Log Explorer** and **Raw Tree** views — exact raw log text, color-coded by event category, with a
  line-indexed minimap.
- **Apex Debug** tab — extracted `USER_DEBUG` statements only.
- **AI analysis** (bring-your-own-key): OpenRouter (free models) and any OpenAI-compatible custom
  endpoint, three output-detail presets (Standard/Brief/Detailed) backed by fixed, non-freeform
  prompt templates, and a guardrailed system prompt (severity-gated, cites specific log lines, never
  emits code).
- **Command palette** (Ctrl/Cmd+K), in-app Find (Ctrl/Cmd+F, per-tab), Markdown export.
- **ApexLens branding** — full icon/favicon/logo/Chrome-Store-asset system.

### Security

- Removed an overly-broad `web_accessible_resources` manifest entry that allowed any website to open
  the extension's app page with attacker-controlled query parameters and trigger a
  cookie-authenticated Salesforce API fetch with no user interaction; added a domain-allowlist guard
  as defense-in-depth.
- Trimmed `manifest.json` permissions to least-privilege (dropped unused `storage`/`tabs`, dropped
  host access for AI providers not yet enabled in the UI, collapsed redundant `host_permissions`
  entries).
- Added prompt-injection hardening to the AI system prompt (treats log content as untrusted data).

### Changed

- Consolidated a category→color mapping that had drifted into 6 independently-maintained tables into
  a single source of truth (`src/app/theme/eventColors.ts`).
- Added real `typecheck` (`tsc --noEmit`) and `lint` (ESLint) scripts to the build pipeline — neither
  existed before despite a strict `tsconfig.json`.
