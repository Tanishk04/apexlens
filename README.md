# ApexLens

A privacy-first Chrome extension (Manifest V3) that turns raw Salesforce debug logs into a
structured, interactive execution model — collapse/expand call tree, flame-chart timeline,
governor-limit dashboard, and SOQL/DML/Flow analysis. All parsing happens locally; no log data
ever leaves the browser. Optional AI diagnosis sends only a structured summary, never the raw log.

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
- `src/background/`, `src/content/` — the only two files that touch `chrome.*` extension APIs.

The parser is registry-driven: a single event catalog (`src/events.ts`) maps every Salesforce log
event across all 9 log categories to a node type. Unknown events fall through to a generic node so
new API versions never break parsing.

## Privacy

No telemetry, no uploads, no external calls by default. Logs are parsed and held in-memory in the
extension tab only.
