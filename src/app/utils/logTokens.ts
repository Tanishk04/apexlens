import { eventCategory } from '../../events';
import { EVENT_COLORS, eventColorFor, type EventColorEntry } from '../theme/eventColors';

export interface LineToken {
  text: string;
  /** Tailwind color class; '' = default foreground. */
  cls: string;
}

const TS_RE = /^(\d{2}:\d{2}:\d{2}\.\d+ \(\d+\))(\|)([A-Z0-9_]+)/;

/** Full color entry for a raw event name (handles exception/debug special-cases
 * that aren't derivable from eventCategory() alone). */
export function eventColorEntry(event: string): EventColorEntry {
  if (event === 'EXCEPTION_THROWN' || event === 'FATAL_ERROR') return EVENT_COLORS.EXCEPTION!;
  if (event.startsWith('USER_DEBUG')) return EVENT_COLORS.DEBUG!;
  return eventColorFor(eventCategory(event));
}

export function eventClass(event: string): string {
  return eventColorEntry(event).textClass;
}

/** CSS var for a raw event name — avoids a class-string round trip for canvas draws. */
export function eventCssVar(event: string): string {
  return eventColorEntry(event).cssVar;
}

/**
 * Tokenize one raw log line for display coloring. The concatenation of all
 * token texts is ALWAYS identical to the input line — color only, no edits.
 */
export function tokenizeLine(line: string): LineToken[] {
  const m = line.match(TS_RE);
  if (!m) {
    // Untimestamped (header / limit block / continuation) — muted whole line.
    return [{ text: line, cls: 'text-muted-foreground' }];
  }

  const [, ts, pipe, event] = m as unknown as [string, string, string, string];
  const rest = line.slice(ts.length + pipe.length + event.length);
  const tokens: LineToken[] = [
    { text: ts, cls: 'text-muted-foreground/70' },
    { text: pipe, cls: 'text-muted-foreground/70' },
    { text: event, cls: eventClass(event) },
  ];

  if (rest) {
    // Color quoted strings green inside the payload; everything else default.
    const parts = rest.split(/("[^"]*")/g);
    for (const part of parts) {
      if (!part) continue;
      tokens.push({
        text: part,
        cls: part.startsWith('"') ? 'text-soql' : '',
      });
    }
  }

  return tokens;
}
