# Security Policy

## Reporting a vulnerability

Please report security issues privately via
[GitHub Security Advisories](https://github.com/Tanishk04/apexlens/security/advisories/new)
rather than a public issue. You'll get a response and a plan for a fix/disclosure timeline.

## Supported versions

Only the latest published version is supported. There is no long-term-support branch.

## Security model

ApexLens is a **bring-your-own-key (BYOK)** Chrome extension with no backend server. A few things
worth knowing if you're auditing it:

- **Salesforce access is session-cookie based and allowlist-scoped.** The extension reads the
  active Salesforce session cookie (`sid`) via the `cookies` permission, but only for domains
  matching `*.salesforce.com`, `*.force.com`, or `*.salesforce-setup.com`
  (`isAllowedSalesforceDomain` in `src/api/salesforce.ts`). The same allowlist gates the app page's
  own domain/logId query-param handling in `src/app/App.tsx`, so the app can't be tricked into
  fetching a log from an arbitrary attacker-supplied host.
- **The app page is not web-accessible.** It's opened only first-party via
  `chrome.tabs.create()` from the background service worker (`src/background/index.ts`) — there is
  no `web_accessible_resources` entry exposing it to arbitrary web pages.
- **AI provider keys never leave the browser except to the provider you chose.** Keys are read
  from/written to `localStorage` only (`src/ai/adapter.ts`, `src/app/components/AiView.tsx`) and
  sent only in the request to that provider's own declared API endpoint — never logged, never sent
  anywhere else.
- **Prompt-injection hardening.** The AI system prompt (`src/ai/context.ts`) explicitly instructs
  the model to treat the debug log content as untrusted data, not instructions, since a debug log
  can contain arbitrary developer-authored strings.
- **No telemetry, no analytics, no remote code execution.** Everything is parsed client-side; see
  [PRIVACY.md](PRIVACY.md) for the full data-flow disclosure.

If you find a gap in any of the above, that's exactly what this policy is for — please report it
privately first.
