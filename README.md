# ApexLens

[![CI](https://github.com/Tanishk04/apexlens/actions/workflows/ci.yml/badge.svg)](https://github.com/Tanishk04/apexlens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A privacy-first Chrome extension (Manifest V3) that turns raw Salesforce debug logs into a
structured, interactive execution model — collapse/expand call tree, flame-chart timeline,
governor-limit dashboard, and SOQL/DML/Flow analysis. All parsing happens locally; no log data
ever leaves the browser. Optional AI diagnosis is bring-your-own-key and fully opt-in.

## Features

- **Entry point at a glance** — the Setup ▸ Debug Logs list gains Type / Class / Method columns
  naming the Apex class, trigger, flow or page behind each log, so you don't have to open logs to
  find the one you want. Each row is identified by reading the first few hundred bytes of its log,
  never the whole thing; results are cached, and the feature can be turned off or set to
  click-to-resolve in Settings. On metered or 2G/3G connections it pauses itself.
- **Execution Tree** — collapsible call tree, multi-type filtering, jump straight to the raw log
  line behind any row.
- **Execution Timeline** — canvas flame chart with bounded pan/zoom and a minimap.
- **Governor Dashboard** — SOQL/DML/CPU/heap usage at a glance.
- **SOQL / DML / Flow Analysis** — sortable, filterable tables.
- **Log Explorer & Raw Tree** — exact raw log text, color-coded by event type, in-app find.
- **AI analysis (BYOK)** — optional, opt-in, guardrailed against speculation and code generation.

<p>
  <img src="branding/ApexLens/ChromeStore/screenshots/screenshot-1.png" width="49%" alt="Execution Tree" />
  <img src="branding/ApexLens/ChromeStore/screenshots/screenshot-2.png" width="49%" alt="Execution Timeline" />
</p>

## Install

- **Chrome Web Store**: pending review — link will be added here once published.
- **From a release**: download `apexlens-<version>.zip` from
  [Releases](https://github.com/Tanishk04/apexlens/releases), unzip it, then load it unpacked
  (`chrome://extensions` → Developer mode → Load unpacked). Each release zip is the exact artifact
  CI built from that tag.
- **From source**: see [Development](#development) below.

Releases are cut by pushing a `v*` tag — see [RELEASING.md](RELEASING.md).

## Stack

- Chrome Manifest V3 · [@crxjs/vite-plugin](https://crxjs.dev)
- React 19 · Vite · TypeScript (strict, `tsc --noEmit` typecheck) · ESLint (flat config)
- Tailwind CSS 4 · Lucide icons
- TanStack Virtual (tree) · Web Worker (parsing)
- Jest + ts-jest (unit tests), @testing-library/react (component tests)

## Development

```bash
npm install
npm run dev         # Vite dev server (HMR)
npm run build       # production build → dist/
npm test            # unit + component tests
npm run typecheck   # tsc --noEmit over the real app source
npm run lint        # eslint
```

### Load the unpacked extension

1. `npm run build`
2. Chrome → `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. Open a Salesforce Setup ▸ Debug Logs page → click **Analyze** next to a log

## Architecture

```
Salesforce Setup page (content script injects an "Analyze" button per log row)
                    │  chrome.runtime.sendMessage({ logId, domain })
                    ▼
      Background service worker (opens the app as its own tab)
                    │  chrome.tabs.create(chrome.runtime.getURL('src/app/index.html?...'))
                    ▼
   App tab: validate domain ──▶ fetch log body (session cookie) ──▶ Web Worker parser
                    │
    ┌───────────────┬───────────────────────┬───────────────────┬────────────────┐
    ▼               ▼                       ▼                   ▼                ▼
Execution Tree  Timeline (canvas)   Governor Dashboard   SOQL/DML/Flow    AI analysis
```

Module boundaries:
- `src/parser.ts`, `src/events.ts`, `src/logDisplay.ts` — pure log-parsing pipeline, no React/DOM.
- `src/app/utils/` — pure derived-data helpers (tree flattening, analysis, flame layout, find).
- `src/app/theme/eventColors.ts` — single source of truth for category → color, used by every
  view that colors log events (tree rows, raw log, flame chart, filter chips, minimap).
- `src/app/components/` — presentation; talks to `utils`/`ai`, never to `chrome.*` directly.
- `src/ai/` — provider registry, prompt building (with prompt-injection hardening), adapters.
- `src/background/`, `src/content/`, `src/api/salesforce.ts` — the only files that touch `chrome.*`
  extension APIs (`tabs`/`runtime`, `runtime`, and `cookies` respectively).

The parser is registry-driven: a single event catalog (`src/events.ts`) maps Salesforce log events
across every log category to a node type, sourced from Salesforce's published *Debug Log Levels*
matrix. Events are bucketed as entry / exit / point / noise / block — getting that wrong is not
cosmetic, since an entry nothing closes silently shifts every later duration by a level.

That catalog is deliberately not treated as complete: Salesforce does not document everything it
emits (`LIMIT_USAGE`, the Wave and Data Access families). So unknown events still render as generic
nodes — new API versions never break parsing — and the parser additionally reports them under
`unrecognizedEvents`, surfaced in the Summary tab, so real logs rather than documentation drive
what the registry learns next.

## Privacy

No telemetry, no uploads, no external calls by default. Logs are parsed and held in-memory in the
extension tab only. Full policy, including exactly what the opt-in AI feature sends and to whom:
[PRIVACY.md](PRIVACY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, the verification scripts CI runs, and coding
conventions. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) too. Security issues: see
[SECURITY.md](SECURITY.md) instead of filing a public issue.

## License

[MIT](LICENSE)
