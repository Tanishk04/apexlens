# Salesforce Debug Log Assistant

A privacy-first Chrome extension (Manifest V3) that turns raw Salesforce debug logs into a
structured, interactive execution model — collapse/expand call tree, flame-chart timeline,
governor-limit dashboard, and SOQL/DML/Flow analysis. All parsing happens locally; no log data
ever leaves the browser. Optional AI diagnosis sends only a structured summary, never the raw log.

## Stack

- Chrome Manifest V3 · [@crxjs/vite-plugin](https://crxjs.dev)
- React 19 · Vite · TypeScript (strict)
- Tailwind CSS 4 · Lucide icons
- TanStack Virtual (tree) · Web Worker (parsing)
- Jest + ts-jest (unit tests)

## Development

```bash
npm install
npm run dev        # Vite dev server (HMR)
npm run build      # production build → dist/
npm test           # run parser + unit tests
```

### Load the unpacked extension

1. `npm run build`
2. Chrome → `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. Open a Salesforce org, click the extension → pick a log → **Analyze**

## Architecture

```
Popup (log list, Tooling API)  ──▶  Background (opens app tab)
                                          │
                                          ▼
App tab: fetch log body ──▶ Web Worker parser ──▶ structured model
                                          │
              ┌───────────────┬───────────┴───────────┬──────────────┐
              ▼               ▼                        ▼              ▼
        Execution Tree    Timeline (canvas)     Governor Dashboard  Analysis
```

The parser is registry-driven: a single event catalog maps every Salesforce log event across all
9 log categories to a node type. Unknown events fall through to a generic node so new API versions
never break parsing.

## Privacy

No telemetry, no uploads, no external calls by default. Logs are parsed and held in-memory in the
extension tab only.
