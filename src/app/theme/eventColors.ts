/**
 * Single source of truth for category → color across the app (tree rows, raw
 * log coloring, flame chart, filter chips, minimap ticks). Previously this
 * table was independently duplicated in six files with nothing keeping them
 * in sync — see logTokens.ts, flameLayout.ts, LogExplorerView.tsx,
 * RawTreeView.tsx, VirtualTree.tsx, FilterBar.tsx (now all import from here).
 *
 * Tailwind's scanner needs literal class strings (no runtime interpolation),
 * so every class below is written out in full rather than built from parts.
 */
export interface EventColorEntry {
  /** Tailwind text-color utility, e.g. 'text-soql'. */
  textClass: string;
  /** CSS custom property backing it, e.g. '--c-soql' (for canvas draws). */
  cssVar: string;
  /** Small badge (bg + text) — tree rows, debug badges. */
  badgeClass: string;
  /** Filter-chip "active" styling (bg + text + ring) — FilterBar. */
  activeChipClass: string;
}

export const EVENT_COLORS: Record<string, EventColorEntry> = {
  CODE_UNIT: {
    textClass: 'text-code-unit',
    cssVar: '--c-code-unit',
    badgeClass: 'bg-code-unit/15 text-code-unit',
    activeChipClass: 'bg-code-unit/15 text-code-unit ring-1 ring-inset ring-code-unit/40',
  },
  METHOD: {
    textClass: 'text-method',
    cssVar: '--c-method',
    badgeClass: 'bg-method/15 text-method',
    activeChipClass: 'bg-method/15 text-method ring-1 ring-inset ring-method/40',
  },
  TRIGGER: {
    textClass: 'text-trigger',
    cssVar: '--c-trigger',
    badgeClass: 'bg-trigger/15 text-trigger',
    activeChipClass: 'bg-trigger/15 text-trigger ring-1 ring-inset ring-trigger/40',
  },
  FLOW: {
    textClass: 'text-flow',
    cssVar: '--c-flow',
    badgeClass: 'bg-flow/15 text-flow',
    activeChipClass: 'bg-flow/15 text-flow ring-1 ring-inset ring-flow/40',
  },
  WORKFLOW: {
    textClass: 'text-workflow',
    cssVar: '--c-workflow',
    badgeClass: 'bg-workflow/15 text-workflow',
    activeChipClass: 'bg-workflow/15 text-workflow ring-1 ring-inset ring-workflow/40',
  },
  SOQL: {
    textClass: 'text-soql',
    cssVar: '--c-soql',
    badgeClass: 'bg-soql/15 text-soql',
    activeChipClass: 'bg-soql/15 text-soql ring-1 ring-inset ring-soql/40',
  },
  SOSL: {
    textClass: 'text-soql',
    cssVar: '--c-soql',
    badgeClass: 'bg-soql/15 text-soql',
    activeChipClass: 'bg-soql/15 text-soql ring-1 ring-inset ring-soql/40',
  },
  DML: {
    textClass: 'text-dml',
    cssVar: '--c-dml',
    badgeClass: 'bg-dml/15 text-dml',
    activeChipClass: 'bg-dml/15 text-dml ring-1 ring-inset ring-dml/40',
  },
  CALLOUT: {
    textClass: 'text-callout',
    cssVar: '--c-callout',
    badgeClass: 'bg-callout/15 text-callout',
    activeChipClass: 'bg-callout/15 text-callout ring-1 ring-inset ring-callout/40',
  },
  VALIDATION: {
    textClass: 'text-validation',
    cssVar: '--c-validation',
    badgeClass: 'bg-warn/10 text-validation',
    activeChipClass: 'bg-warn/10 text-validation ring-1 ring-inset ring-validation/40',
  },
  VF: {
    textClass: 'text-vf',
    cssVar: '--c-vf',
    badgeClass: 'bg-vf/15 text-vf',
    activeChipClass: 'bg-vf/15 text-vf ring-1 ring-inset ring-vf/40',
  },
  SYSTEM: {
    textClass: 'text-system',
    cssVar: '--c-system',
    badgeClass: 'bg-muted text-foreground',
    activeChipClass: 'bg-muted text-foreground ring-1 ring-inset ring-border',
  },
  DEBUG: {
    textClass: 'text-debug',
    cssVar: '--c-debug',
    badgeClass: 'bg-debug/15 text-debug',
    activeChipClass: 'bg-debug/15 text-debug ring-1 ring-inset ring-ring',
  },
  EXCEPTION: {
    textClass: 'text-error',
    cssVar: '--c-error',
    badgeClass: 'bg-error/10 text-error',
    activeChipClass: 'bg-error/15 text-error ring-1 ring-inset ring-error/40',
  },
  GENERIC: {
    textClass: 'text-system',
    cssVar: '--c-system',
    badgeClass: 'bg-muted text-muted-foreground',
    activeChipClass: 'bg-muted text-foreground ring-1 ring-inset ring-border',
  },
};

/** Color entry for a category, falling back to GENERIC for anything unknown. */
export function eventColorFor(category: string): EventColorEntry {
  return EVENT_COLORS[category] ?? EVENT_COLORS.GENERIC!;
}
