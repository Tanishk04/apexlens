# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] — 2026-07-25

### Added

- **Type / Class / Method columns on the Debug Logs list.** Salesforce's own list shows
  Operation/Status/Size but never the code that ran, so identifying a log meant opening logs one at
  a time. ApexLens now names the Apex class, trigger, flow or page behind each row, in both Classic
  and Lightning.

  Rows resolve only once they scroll into view, and each lookup asks for a 64 KB byte range and
  stops reading at the first `CODE_UNIT_STARTED` — usually a few hundred bytes, whether the log is
  3 MB or 20 MB. Results are cached in local storage; ApexLog bodies are immutable, so revisiting
  or re-sorting the list costs no network at all.

  **The saving is measured, not assumed.** If reads on your org turn out not to be bounded — the
  server ignoring the range request *and* the transfer not stopping when cancelled — the extension
  notices from the bytes it actually read and pauses the lookups itself, rather than quietly
  downloading full logs. It says so, with the observed figure, in Settings and in the ⓘ panel.

- **Settings page**, reachable from `chrome://extensions` and the ⓘ chip on the Debug Logs list.
  Turn the columns off entirely, switch to click-to-resolve, or let them pause automatically on
  metered and 2G/3G connections (all three on by default). Shows how many logs are cached, with a
  Clear cache button.

- **ⓘ chip on the Debug Logs list** — what the columns are, what's new in this version, and a link
  to Settings. Rendered in a shadow root so Salesforce's stylesheet cannot restyle it and its
  styles cannot leak into the page.

- **Tag-driven releases.** Pushing a `v*` tag runs the full CI suite, builds the extension, and
  publishes a GitHub Release with the installable zip attached and this changelog's matching
  section as the release notes. See [RELEASING.md](RELEASING.md).

### Fixed

- **Analyze now works from an Incognito window.** It previously opened the analyzer in a *normal*
  window and then reported "Session not found" — the user was logged in, just in a profile that
  page could not see. The extension ran in Chrome's default `spanning` mode, which cannot load
  extension pages into incognito tabs, so the tab landed in the wrong profile and the cookie lookup
  read the wrong store. Now declared `"incognito": "split"`, and the analyzer opens in the window
  the request came from. **Requires "Allow in Incognito" to be enabled** for ApexLens on
  `chrome://extensions`.

  Entry-point lookups on the Debug Logs list failed in private windows for the same reason and are
  fixed by the same change. Nothing from a private window is cached — see [PRIVACY.md](PRIVACY.md).

- The "Session not found" message no longer tells you to log in when you already are; it names the
  profile boundary that actually causes it.

- **Tree rows now line up.** A row with children and a leaf row at the same depth were indented
  differently: the expand button's width came from rem-based padding while the leaf spacer used a
  literal pixel width, and the app's 13px root font size made the two disagree by ~5px. Both now
  share one fixed-size slot. Same fix applied to the Raw Tree.

- **Validation rules read as one row.** Salesforce reports each rule as three events
  (`VALIDATION_RULE`, `VALIDATION_FORMULA`, `VALIDATION_PASS`/`FAIL`), so a log with 51 rules drew
  153 rows, two thirds of them unnamed. They now fold into a single row per rule carrying the
  result, with the often multi-line formula shown in the detail panel.

- **`FLOW_INTERVIEW_FINISHED` no longer corrupts the execution tree.** It fires after the interview
  has already closed and pairs with nothing, but matched the `_FINISHED` suffix rule and popped an
  unrelated node — shifting every duration after it. It is absent from Salesforce's published event
  catalog and was found only by parsing a real workflow log.

- **Governor tab no longer repeats every metric.** Salesforce writes a full snapshot per code unit
  — 17 blocks for one namespace in a real workflow log, all 13 metrics repeated in each — so a
  namespace that should show 13 cards showed 221, with React warning about duplicate keys. Each
  metric is now one card holding the highest figure reported for it (the values only ever climb
  across snapshots in every log inspected, so highest and final coincide).

- **Flow Analysis no longer lists every flow twice, or things that are not flows.** Four different
  events all produced a row of type `FLOW`: the interview's name, the interview's *id* (a second,
  duplicate row for the same flow), the interview *count* (a row literally named `1`, previously
  the largest entry in the table), and any `CODE_UNIT_STARTED` whose payload happens to contain
  "flow". Only named interviews and flow elements are aggregated now.

- **Validation results show without opening each row.** A rule's PASS/FAIL previously appeared only
  in the detail panel — 51 clicks to see which of 51 rules failed. Now shown as a badge on the row
  itself; the formula stays in the detail panel, where its length belongs.

- **Execution Tree's metric columns (SOQL/DML/Rows/Total/Self) now stay aligned with their
  header** at any scroll position. The header lived outside the scrollable area while the columns
  it labelled were pinned to the *inside* of it — two different boxes computing two different right
  edges, off by exactly the vertical scrollbar's width. They're now one box.

- **Execution Tree metrics no longer bleed through long row text.** The sticky metric background
  was 90% opaque, and the "slow" self-time badge only 10% — invisible with a short demo query, but a
  real multi-hundred-character SOQL query sliding underneath showed clearly through both, worst on
  the badge. Both are now fully opaque.

- **`WF_CRITERIA_BEGIN` and `WF_FLOW_ACTION_BEGIN` show real labels.** The default formatter picked
  the last pipe field — for `WF_CRITERIA_BEGIN` that's the evaluation order, always a small integer,
  producing rows literally named `0`; `WF_FLOW_ACTION_BEGIN` carries only a bare id. Rule name and a
  labelled id are shown instead.

- **Flow Analysis: Element and Flow no longer show the same text, and elements are no longer
  blank.** An interview's `flowDetails` set `flowName` to its own name — duplicated into both
  columns. A flow element's `flowName` was hardcoded to `''`, so any log containing real flow
  elements would show a blank Flow column with no way to tell which flow they belonged to. Elements
  now inherit the real flow name from the enclosing interview (or nesting element) on the execution
  stack; interviews show their name once.

- **Execution Timeline's hover tooltip no longer overflows past the bottom of the screen.** Its
  overflow-avoidance math clamped against an assumed 76px height, but a long, unwrapped frame name
  could render far taller. Capped at that same height with internal scroll, so the assumption the
  clamp math relies on can no longer be exceeded.

- **The in-app header now shows the actual ApexLens mark.** It was rendering an unrelated hand-drawn
  "magnifying glass + A" design found nowhere else in the brand assets, citing a `mark-simple.svg`
  that doesn't exist. Replaced with the real mark from `branding/ApexLens/SVG/mark-transparent.svg`.

- **Type/Class/Method columns on a real Debug Logs page could attach to the wrong element.** Classic
  Setup is a table-based layout with several `<table>`s on one page; picking the first table with
  even one matching row let a decoy (a "recently viewed" widget, a hover preview) win over the real
  list, which needs many matches. Now picks the table with the most.

### Added

- **Expand All / Collapse All** on every analysis table (Execution / SOQL / DML / Flow) — previously
  only per-row.

- **Jump to Log Explorer from a SOQL-in-loop row.** A loop row aggregates several executions, so it
  jumps to the first occurrence.

### Changed

- Restored the `storage` permission, dropped in 1.0.0 as unused. It now backs the entry-point
  cache described above — without it, every visit to the Debug Logs list would refetch every row.
- The Tooling API version is a single `API_VERSION` constant in `src/api/salesforce.ts` rather than
  a literal buried in a URL template.

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
