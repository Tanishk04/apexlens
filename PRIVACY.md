# Privacy Policy — ApexLens

_Last updated: 2026-07-13_

ApexLens is a bring-your-own-key (BYOK) Chrome extension with **no backend server**. There is
nowhere for your data to go except the destinations described below, all of which you control.

## What ApexLens accesses

- **Salesforce session cookie.** ApexLens reads your active Salesforce session cookie (`sid`) via
  the Chrome `cookies` permission, scoped only to `*.salesforce.com`, `*.force.com`, and
  `*.salesforce-setup.com` domains. It is used only to read debug logs from your own org via
  Salesforce's own Tooling API — using your own session, as you.
- **Debug log bodies, in two situations.** When you click **Analyze** on a log, ApexLens fetches
  that log in full. Separately, on the Setup ▸ Debug Logs list, it reads the *beginning* of each
  log that scrolls into view in order to fill the Type / Class / Method columns — it requests only
  the first 64 KB and stops as soon as it finds the first code-unit line, typically within a few
  hundred bytes, and never downloads those logs in full. Both requests go to your org and nowhere
  else. The columns can be switched off, or set to only run when you click, in the extension's
  Settings page.
- **The debug log content itself.** Once fetched (or opened from a local `.log` file), the log is
  parsed entirely inside the extension, in your browser. Nothing is uploaded anywhere by default.

## What ApexLens does NOT do

- No telemetry, no analytics, no usage tracking of any kind.
- No data is sold, shared, or sent to the extension's developer. There is no server to send it to.
- No remotely-hosted or dynamically-fetched code — everything the extension runs is bundled in the
  extension package you installed.

## Optional AI analysis (opt-in only)

If you explicitly configure an AI provider and supply your own API key, ApexLens can send log data
to analyze it — **only when you click "Analyze log" on the AI tab**, never automatically.

The **Send** control on the AI tab decides what leaves your browser. It defaults to summary-only,
and your choice is shown — along with an estimated token count for exactly that choice — before you
run anything:

- **"Summary only" (the default).** Sends a compact structured summary: exception types and
  messages, governor-limit percentages, the slowest queries and methods, DML counts. The raw log
  text is **not** sent.
- **"Full raw log".** Sends that same summary *plus* the complete raw log text, for a line-by-line
  read. Debug logs frequently contain customer data in `System.debug` output and query results, so
  this is never the default — you have to select it.
- Either way, this data goes **directly from your browser to the provider you chose** —
  OpenRouter, Anthropic, OpenAI, a local Ollama instance, or any custom OpenAI-compatible endpoint
  you type in — using the API key you supplied. ApexLens's developer never sees this data or your
  key; both go straight to the provider's own API over HTTPS.
- Your API key is stored only in your browser's `localStorage`, scoped to the extension. It is
  never logged, transmitted anywhere except the provider's own endpoint, or accessible to any
  website you visit.

## Data retention

ApexLens caches the entry point it read for each log (the class, trigger or flow name, plus the log
id) in the extension's local storage, so revisiting the Debug Logs list doesn't re-read the same
logs. It holds the most recent 500 and stores no other part of any log. Clearing the extension's
site data removes it.

**Nothing is cached from a private window.** Chrome shares extension storage between normal and
Incognito sessions even though it separates their cookies, so writing there would leave a durable
record of which logs — and therefore which Apex classes — you looked at privately. ApexLens skips
those writes entirely; private-window lookups are resolved fresh each time and forgotten.

Beyond that, ApexLens retains nothing outside your browser's local storage (theme preference, your chosen
AI provider/model settings, and your API key if you've entered one — all removable by clearing the
extension's site data in Chrome). Whether the AI provider you chose retains what you send them is
governed by *their* privacy policy, not this one.

## Changes to this policy

If this policy changes, the update will be reflected in this file's history on GitHub and the "Last
updated" date above.

## Contact

Questions or concerns: open an issue at
[github.com/Tanishk04/apexlens/issues](https://github.com/Tanishk04/apexlens/issues), or see
[SECURITY.md](SECURITY.md) for reporting a security concern privately.
