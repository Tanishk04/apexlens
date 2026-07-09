import type { LogEventLine } from '../../types';
import { isEntryEvent, isExitEvent } from '../../events';
import { eventCategory } from '../../events';

/**
 * A row in the Raw Tree: every parsed event line (including noise events such
 * as STATEMENT_EXECUTE / HEAP_ALLOCATE / VARIABLE_*), nested by entry/exit.
 */
export interface RawTreeRow {
  id: string;
  depth: number;
  event: string;
  category: string;
  payload: string;
  lineNumber: number;
  timestampNs: number;
  /** True when this row has nested rows (entry events). */
  expandable: boolean;
}

/**
 * Build a nested view over ALL event lines with a simple entry/exit stack walk.
 * eventLines already contains every event the lexer saw, so this reconstructs
 * the "Raw Tree" without changing the parser or its memory profile.
 *
 * Returns rows in document order with a depth per row, plus childCount used to
 * mark expandable rows. Collapse state is applied by `visibleRawRows`.
 */
export function buildRawRows(eventLines: LogEventLine[]): RawTreeRow[] {
  const rows: RawTreeRow[] = [];
  // Indices (into rows) of currently-open entry rows.
  const stack: number[] = [];

  for (const line of eventLines) {
    const { event } = line;

    if (isExitEvent(event)) {
      // Exit closes the innermost open entry; the exit line itself is shown at
      // the parent depth so pairs read naturally.
      const depth = Math.max(0, stack.length - 1);
      rows.push({
        id: line.id,
        depth,
        event,
        category: eventCategory(event),
        payload: line.payload,
        lineNumber: line.lineNumber,
        timestampNs: line.timestampNs,
        expandable: false,
      });
      stack.pop();
      continue;
    }

    const entry = isEntryEvent(event);
    rows.push({
      id: line.id,
      depth: stack.length,
      event,
      category: eventCategory(event),
      payload: line.payload,
      lineNumber: line.lineNumber,
      timestampNs: line.timestampNs,
      expandable: entry, // provisional; cleared below if nothing nested
    });
    if (entry) stack.push(rows.length - 1);
  }

  // An entry immediately followed by its exit (or EOF) has no nested rows.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.expandable) {
      const next = rows[i + 1];
      if (!next || next.depth <= row.depth) row.expandable = false;
    }
  }

  return rows;
}

/** Apply collapse state: hide all rows deeper than a collapsed ancestor. */
export function visibleRawRows(rows: RawTreeRow[], collapsed: Set<string>): RawTreeRow[] {
  const result: RawTreeRow[] = [];
  let hideDeeperThan = -1; // -1 = not hiding

  for (const row of rows) {
    if (hideDeeperThan >= 0) {
      if (row.depth > hideDeeperThan) continue;
      hideDeeperThan = -1;
    }
    result.push(row);
    if (row.expandable && collapsed.has(row.id)) hideDeeperThan = row.depth;
  }
  return result;
}
