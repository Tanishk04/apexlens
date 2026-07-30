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
  /** Short name shown next to the badge in the legend. */
  label: string;
  /**
   * One-sentence, plain-English explanation of what this badge means — shown
   * as a tooltip on the badge itself and in the Filter Bar legend. New users
   * have no reason to already know Salesforce's own event categories, and
   * Salesforce's docs don't map cleanly onto our types anyway: Salesforce
   * files both `FLOW_*` and `WF_*` events under one "Workflow" category, but
   * we split them into FLOW and WORKFLOW here on purpose, so that split gets
   * called out explicitly rather than left for someone to puzzle over.
   */
  description: string;
}

export const EVENT_COLORS: Record<string, EventColorEntry> = {
  CODE_UNIT: {
    textClass: 'text-code-unit',
    cssVar: '--c-code-unit',
    badgeClass: 'bg-code-unit/15 text-code-unit',
    activeChipClass: 'bg-code-unit/15 text-code-unit ring-1 ring-inset ring-code-unit/40',
    label: 'Code Unit',
    description: 'A top-level unit of executed code — a trigger, an anonymous block, a Visualforce controller, or similar.',
  },
  METHOD: {
    textClass: 'text-method',
    cssVar: '--c-method',
    badgeClass: 'bg-method/15 text-method',
    activeChipClass: 'bg-method/15 text-method ring-1 ring-inset ring-method/40',
    label: 'Method',
    description: 'An Apex method or constructor call.',
  },
  TRIGGER: {
    textClass: 'text-trigger',
    cssVar: '--c-trigger',
    badgeClass: 'bg-trigger/15 text-trigger',
    activeChipClass: 'bg-trigger/15 text-trigger ring-1 ring-inset ring-trigger/40',
    label: 'Trigger',
    description: 'An Apex trigger firing on a DML event (insert, update, delete, etc.).',
  },
  FLOW: {
    textClass: 'text-flow',
    cssVar: '--c-flow',
    badgeClass: 'bg-flow/15 text-flow',
    activeChipClass: 'bg-flow/15 text-flow ring-1 ring-inset ring-flow/40',
    label: 'Flow',
    description: 'A Flow — built with Flow Builder. Salesforce’s newer automation tool: screens, decisions, loops, record updates.',
  },
  WORKFLOW: {
    textClass: 'text-workflow',
    cssVar: '--c-workflow',
    badgeClass: 'bg-workflow/15 text-workflow',
    activeChipClass: 'bg-workflow/15 text-workflow ring-1 ring-inset ring-workflow/40',
    label: 'Workflow',
    description: 'A Workflow Rule, Process Builder process, or Approval Process — Salesforce’s older automation tools, shown separately from Flow above.',
  },
  SOQL: {
    textClass: 'text-soql',
    cssVar: '--c-soql',
    badgeClass: 'bg-soql/15 text-soql',
    activeChipClass: 'bg-soql/15 text-soql ring-1 ring-inset ring-soql/40',
    label: 'SOQL',
    description: 'A SOQL query against the database.',
  },
  SOSL: {
    textClass: 'text-soql',
    cssVar: '--c-soql',
    badgeClass: 'bg-soql/15 text-soql',
    activeChipClass: 'bg-soql/15 text-soql ring-1 ring-inset ring-soql/40',
    label: 'SOSL',
    description: 'A SOSL search (full-text search across objects).',
  },
  DML: {
    textClass: 'text-dml',
    cssVar: '--c-dml',
    badgeClass: 'bg-dml/15 text-dml',
    activeChipClass: 'bg-dml/15 text-dml ring-1 ring-inset ring-dml/40',
    label: 'DML',
    description: 'A data change — insert, update, delete, upsert, or merge.',
  },
  CALLOUT: {
    textClass: 'text-callout',
    cssVar: '--c-callout',
    badgeClass: 'bg-callout/15 text-callout',
    activeChipClass: 'bg-callout/15 text-callout ring-1 ring-inset ring-callout/40',
    label: 'Callout',
    description: 'An HTTP callout to an external system, including Named Credentials and External Data Sources.',
  },
  VALIDATION: {
    textClass: 'text-validation',
    cssVar: '--c-validation',
    badgeClass: 'bg-warn/10 text-validation',
    activeChipClass: 'bg-warn/10 text-validation ring-1 ring-inset ring-validation/40',
    label: 'Validation',
    description: 'A validation rule evaluating on a record, shown as one row with its pass/fail result and formula.',
  },
  VF: {
    textClass: 'text-vf',
    cssVar: '--c-vf',
    badgeClass: 'bg-vf/15 text-vf',
    activeChipClass: 'bg-vf/15 text-vf ring-1 ring-inset ring-vf/40',
    label: 'Visualforce',
    description: 'Visualforce page lifecycle — view state, formula evaluation, or an Apex call from the page.',
  },
  SYSTEM: {
    textClass: 'text-system',
    cssVar: '--c-system',
    badgeClass: 'bg-muted text-foreground',
    activeChipClass: 'bg-muted text-foreground ring-1 ring-inset ring-border',
    label: 'System',
    description: 'Platform-internal bookkeeping — system-mode method calls, trace-flag changes, and similar.',
  },
  DEBUG: {
    textClass: 'text-debug',
    cssVar: '--c-debug',
    badgeClass: 'bg-debug/15 text-debug',
    activeChipClass: 'bg-debug/15 text-debug ring-1 ring-inset ring-ring',
    label: 'Debug',
    description: 'A System.debug() statement from the Apex code.',
  },
  EXCEPTION: {
    textClass: 'text-error',
    cssVar: '--c-error',
    badgeClass: 'bg-error/10 text-error',
    activeChipClass: 'bg-error/15 text-error ring-1 ring-inset ring-error/40',
    label: 'Exception',
    description: 'An exception thrown or a fatal error.',
  },
  GENERIC: {
    textClass: 'text-system',
    cssVar: '--c-system',
    badgeClass: 'bg-muted text-muted-foreground',
    activeChipClass: 'bg-muted text-foreground ring-1 ring-inset ring-border',
    label: 'Other',
    description: 'An event we don’t have a specific category for yet — still shown, just without dedicated styling.',
  },
};

/** Color entry for a category, falling back to GENERIC for anything unknown. */
export function eventColorFor(category: string): EventColorEntry {
  return EVENT_COLORS[category] ?? EVENT_COLORS.GENERIC!;
}
