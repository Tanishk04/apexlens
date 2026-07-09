import { eventCategory } from '../../events';

export interface LineToken {
  text: string;
  /** Tailwind color class; '' = default foreground. */
  cls: string;
}

const TS_RE = /^(\d{2}:\d{2}:\d{2}\.\d+ \(\d+\))(\|)([A-Z0-9_]+)/;

const CATEGORY_CLS: Record<string, string> = {
  SOQL: 'text-soql',
  SOSL: 'text-soql',
  DML: 'text-dml',
  CALLOUT: 'text-callout',
  FLOW: 'text-flow',
  WORKFLOW: 'text-workflow',
  VALIDATION: 'text-validation',
  VF: 'text-vf',
  METHOD: 'text-method',
  CODE_UNIT: 'text-code-unit',
  EXCEPTION: 'text-error',
  DEBUG: 'text-debug',
  SYSTEM: 'text-system',
  GENERIC: 'text-system',
};

export function eventClass(event: string): string {
  if (event === 'EXCEPTION_THROWN' || event === 'FATAL_ERROR') return 'text-error';
  if (event.startsWith('USER_DEBUG')) return 'text-debug';
  return CATEGORY_CLS[eventCategory(event)] ?? 'text-system';
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
