# Contributing to ApexLens

Thanks for considering a contribution.

## Development setup

```bash
npm install
npm run dev       # Vite dev server (HMR)
```

Load the unpacked extension for manual testing: `npm run build`, then in Chrome go to
`chrome://extensions`, enable **Developer mode**, **Load unpacked**, and select the `dist/` folder.

## Before opening a PR

Run all four checks locally — CI runs the same ones:

```bash
npm run typecheck   # tsc --noEmit over the real app source
npm run lint        # eslint
npm test            # unit + component tests
npm run build       # production build
```

All four must pass clean. If `typecheck`/`lint` surface a real issue, fix it — don't add a
suppression comment without a one-line reason for why it's a false positive (see the
`react-hooks/exhaustive-deps` suppressions in `LogExplorerView.tsx`/`RawTreeView.tsx`/
`VirtualTree.tsx` for the pattern: a comment explaining *why*, not a bare disable).

## Conventions

- **Strict TypeScript, no `any`.** The project has zero `any` usage today — keep it that way.
  `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes` are on; respect them rather than casting
  around them.
- **Reuse the shared color system.** Category → color/class/CSS-var mappings live in exactly one
  place: `src/app/theme/eventColors.ts`. Don't add a new local color table in a component — import
  `eventColorFor()`.
- **Parsing stays pure and off-main-thread.** `src/parser.ts`/`src/events.ts` have zero React/DOM
  imports; all parsing runs through the Web Worker (`src/parser.worker.ts`,
  `src/app/utils/parseInWorker.ts`). Don't add a synchronous main-thread parse path.
- **No new dependency without a reason.** The dependency list is intentionally lean (6 runtime
  deps). If you need a library, say why in the PR description.
- **BYOK model for AI providers.** Every AI provider call goes through the user's own API key,
  read from `localStorage` (see `src/ai/adapter.ts`). Never hardcode a key or send data anywhere
  the user didn't explicitly choose.

## Reporting bugs / requesting features

Use the GitHub issue templates (`.github/ISSUE_TEMPLATE/`). For security issues, see
[SECURITY.md](SECURITY.md) instead of filing a public issue.

## Project structure

See the **Architecture** section in [README.md](README.md#architecture) for the module map
(parser → utils → components → ai layer → background/content scripts).
