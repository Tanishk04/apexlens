# Chrome Web Store listing — submission copy

Content to paste into the Developer Dashboard when submitting. Not consumed by the code — this is
prep material only.

## Category

**Developer Tools**

## Short description (≤132 characters)

```
ApexLens — AI-assisted Salesforce Apex debug log analysis.
```
(60 characters — matches `manifest.json`'s `description` field exactly, so the store listing and
the extension's own self-description never drift apart.)

## Detailed description

```
ApexLens turns raw Salesforce Apex debug logs into a structured, interactive execution model —
no more scrolling through thousands of lines of plain text.

FEATURES
• Execution Tree — collapsible call tree, multi-type filtering, jump straight to the raw log line
  behind any row.
• Execution Timeline — a canvas flame chart with bounded pan/zoom and a minimap, so you can see
  exactly where time went in a transaction.
• Governor Dashboard — SOQL/DML/CPU/heap usage at a glance, with the limits that actually matter
  highlighted.
• SOQL / DML / Flow Analysis — sortable, filterable tables of every query and DML statement.
• Log Explorer & Raw Tree — the exact raw log text, color-coded by event type, with in-app find.
• Debug Logs List Enhancement — adds Type/Class/Method columns to Salesforce's own Debug Logs
  list, so you can see which Apex class, trigger, or flow produced each log without opening it.
  Reads only the first few KB per log (never the full body), caches the result locally (most
  recent 500, never written in Incognito), and is fully optional — turn it off or switch to
  click-to-resolve from the new Settings page.
• AI-assisted analysis (bring your own key) — optional, opt-in. Point it at OpenRouter (free
  models available) or your own OpenAI-compatible endpoint, and get a concise, guardrailed
  diagnosis: what happened, which governor limits are elevated, and what to fix — never invented
  code, never speculation about code it can't see.

PRIVACY, BY DESIGN
• Parsing happens entirely in your browser. Nothing is uploaded anywhere by default.
• The Debug Logs list feature caches only a log's resolved class/trigger/flow name and its ID —
  never the log body — capped at 500 entries, and never written for Incognito sessions.
• AI analysis is fully opt-in and BYOK: your API key and any data you send goes directly from your
  browser to the provider you chose — never through any server we run, because we don't run one.
• No telemetry, no analytics, no tracking.
Full privacy policy: https://github.com/Tanishk04/apexlens/blob/main/PRIVACY.md

HOW TO USE
Open a Salesforce Setup → Debug Logs page. ApexLens adds an "Analyze" button next to each log —
click it to open the full analysis in a new tab.

Open source (MIT licensed): https://github.com/Tanishk04/apexlens
```

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Used for three things, all on-device: (1) caching the resolved class/trigger/flow name for each Debug Log row so revisiting the list doesn't re-fetch the same logs — capped at the 500 most recent, never written for Incognito sessions; (2) the user's extension settings (theme, whether the Type/Class/Method columns are enabled, AI provider/model choice); (3) the user's own AI provider API key, if entered, used only to call that provider directly from the browser. Nothing here is transmitted to the developer or any third party. |
| `cookies` | Used to read your existing Salesforce session cookie so ApexLens can fetch the specific debug log you click "Analyze" on, using your own logged-in session. No separate login or credential entry is ever required. |
| `host_permissions`: `https://*.salesforce.com/*`, `https://*.force.com/*`, `https://*.salesforce-setup.com/*` | Required to (a) detect the Debug Logs page in Salesforce Setup and inject the "Analyze" button, and (b) fetch the log body from your own org via the Salesforce Tooling API. Scoped strictly to Salesforce's own domains — the extension cannot read cookies or fetch data from any other site. |
| `host_permissions`: `https://openrouter.ai/*` | Only contacted if you choose OpenRouter as your AI provider and explicitly click "Analyze log" — sends log data directly to OpenRouter using the API key you supplied. Never contacted otherwise. |
| `host_permissions`: `http://localhost/*` | Only contacted if you choose to run a local Ollama model as your AI provider (`localhost:11434`) — never used for anything else. |

## Data-usage disclosure (broader than `host_permissions` alone)

The Dashboard's privacy questionnaire asks about all remote destinations the extension can reach,
not just what's declared in `host_permissions`. Beyond the above:

- **Custom AI endpoint**: the AI tab's "Custom" provider lets you type in *any* URL — the extension
  will send data there if and only if you configure it and click Analyze. This is by design (BYOK
  to any OpenAI-compatible server, e.g. self-hosted or enterprise deployments) — the extension has
  no fixed list of "custom" destinations because the user supplies the destination.
- Two additional providers (Anthropic/Claude, OpenAI/ChatGPT) exist in the code but are currently
  **disabled in the UI** ("coming soon") and not selectable in this release — no data can reach
  them today.
- In all cases: data only leaves the browser when the user explicitly clicks "Analyze log" after
  configuring a provider and key themselves. Nothing is automatic.

## Single purpose description

```
Parses Salesforce Apex debug logs into an interactive execution tree, timeline, and governor-limit
dashboard, with optional bring-your-own-key AI analysis.
```
