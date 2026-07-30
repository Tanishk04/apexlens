/**
 * Entry-point extraction: which Apex class, trigger, flow or page actually
 * started a transaction.
 *
 * Salesforce's Debug Logs list shows Operation/Status/Size but never the code
 * that ran, so identifying a log means opening it. The answer is in the log's
 * first CODE_UNIT_STARTED line, which this module turns into a displayable
 * {type, className, methodName}.
 *
 * Pure by design — no DOM, no chrome.* — so it can run in the background worker,
 * the app, or a test. Payload shapes marked "unconfirmed" below are derived from
 * known log formats rather than logs on hand; they degrade to a usable label
 * rather than throwing if a real org disagrees.
 */

/** Coarse kind of thing that started a transaction. */
export type EntryPointType =
  | 'Apex'
  | 'Trigger'
  | 'Flow'
  | 'Workflow'
  | 'Visualforce'
  | 'Anonymous'
  | 'Unknown';

export interface EntryPoint {
  type: EntryPointType;
  /** Class, trigger, flow or page name. Empty when the payload carries none. */
  className: string;
  /** Method name, or the trigger event. Empty when not applicable. */
  methodName: string;
}

const EMPTY: EntryPoint = { type: 'Unknown', className: '', methodName: '' };

/** 15/18-char Salesforce id, used to spot and drop the leading entity id field. */
const SF_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

/**
 * `AccountTrigger on Account trigger event BeforeUpdate` — the trigger name and
 * its event are both in one free-text field, so they need pulling apart.
 */
const TRIGGER_RE = /^(.+?)\s+on\s+(.+?)\s+trigger\s+event\s+(.+)$/i;

/** `Foo.bar(Id, String)` or `Foo.bar()` — parameter list is noise for a column. */
const METHOD_RE = /^([\w.]+)\.(\w+)\s*\(/;

/**
 * `BeforeUpdate` / `AfterInsert` / etc — the DML operation is what a user
 * scans a log list for; Before/After is a real distinction (a before trigger
 * can still edit fields pre-save, an after trigger can't) but isn't what this
 * column is for, and the two run together into one opaque word otherwise.
 */
const TRIGGER_EVENT_RE = /^(?:Before|After)(Insert|Update|Delete|Undelete)$/i;

/**
 * Parse one CODE_UNIT_STARTED payload — the pipe-delimited remainder after
 * `time|CODE_UNIT_STARTED`, with the `[N]` line token already stripped by the
 * Lexer.
 */
export function parseEntryPoint(payload: string): EntryPoint {
  // `[EXTERNAL]` is a marker, and a bare 15/18-char id adds nothing a column can
  // show. Drop both so the meaningful field is last regardless of shape.
  const parts = payload
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '[EXTERNAL]' && !SF_ID.test(p));

  if (parts.length === 0) return EMPTY;

  // Aura/LWC controller action: apex://Klass/ACTION$method
  const action = parts.find((p) => p.startsWith('apex://'));
  if (action) {
    const body = action.slice('apex://'.length);
    const [klass = '', rest = ''] = body.split('/');
    const method = rest.includes('$') ? rest.slice(rest.indexOf('$') + 1) : '';
    return { type: 'Apex', className: klass, methodName: method };
  }

  // Trigger: the `__sfdc_trigger/Name` field may follow, so search rather than
  // assuming a position.
  const trigger = parts.find((p) => TRIGGER_RE.test(p));
  if (trigger) {
    const m = trigger.match(TRIGGER_RE)!;
    const event = m[3]!.trim();
    const object = m[2]!.trim();
    const opMatch = event.match(TRIGGER_EVENT_RE);
    return {
      type: 'Trigger',
      className: m[1]!.trim(),
      // Prefer just the operation (Update/Insert/Delete/Undelete). An event
      // string we don't recognise falls back to showing it verbatim with the
      // object — a real, if unfiltered, answer beats guessing wrong.
      methodName: opMatch
        ? opMatch[1]![0]!.toUpperCase() + opMatch[1]!.slice(1).toLowerCase()
        : `${event} on ${object}`,
    };
  }

  const primary = parts[parts.length - 1]!;

  if (/^Flow:/i.test(primary)) {
    return { type: 'Flow', className: primary.slice(primary.indexOf(':') + 1).trim(), methodName: '' };
  }
  if (/^Workflow:/i.test(primary)) {
    return {
      type: 'Workflow',
      className: primary.slice(primary.indexOf(':') + 1).trim(),
      methodName: '',
    };
  }
  if (/^VF:/i.test(primary)) {
    return {
      type: 'Visualforce',
      className: primary.slice(primary.indexOf(':') + 1).trim(),
      methodName: '',
    };
  }
  if (/execute_anonymous/i.test(primary)) {
    return { type: 'Anonymous', className: 'Anonymous Apex', methodName: '' };
  }

  // Klass.method(args) — also how batch/queueable/future/scheduled entry points
  // appear (MyBatch.execute(), MyQueueable.execute(), …).
  const method = primary.match(METHOD_RE);
  if (method) {
    return { type: 'Apex', className: method[1]!, methodName: method[2]! };
  }

  // Something we do not recognise. Show it rather than dropping it — an
  // unfamiliar label still tells the user more than a blank cell.
  return { type: 'Unknown', className: primary, methodName: '' };
}

/**
 * A record-triggered flow's outer `CODE_UNIT_STARTED` is `Flow:<Object>` —
 * the object it fires on (e.g. `Flow:Case`), not which flow actually ran;
 * there can even be several. The real name shows up moments later as the
 * last pipe field of `FLOW_CREATE_INTERVIEW_END` or `FLOW_START_INTERVIEW_BEGIN`
 * (e.g. `Case_Update_Pilot_From_Owner`). Structurally `Flow:Case` looks
 * exactly like a real, specific answer — colon-separated, non-empty — so
 * `isMeaningfulEntryPoint` alone can't tell the two apart; this always
 * prefers the more specific inner name once one turns up, since it's never
 * less useful than the object it fired on.
 */
export function refineFlowEntryPoint(entry: EntryPoint, event: string, payload: string): EntryPoint {
  if (entry.type !== 'Flow') return entry;
  if (event !== 'FLOW_CREATE_INTERVIEW_END' && event !== 'FLOW_START_INTERVIEW_BEGIN') return entry;
  const parts = payload
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const name = parts[parts.length - 1];
  if (!name) return entry;
  return { ...entry, className: name };
}

/**
 * True when a CODE_UNIT_STARTED payload is a real code unit worth stopping
 * at — false for Salesforce's bare phase-boundary markers. A real log can
 * emit `CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS` wrapping an entire bulk
 * trigger phase, with no class or method of its own, moments before the
 * actual `Klass.method(...)` that did the work. Stopping at the first
 * CODE_UNIT_STARTED unconditionally picks up the marker and hides the real
 * entry point. A bare single word with no separator (no `.`, `:`, `/`, or
 * space) and nothing else to show is the marker shape; anything with
 * structure — a trigger, a Flow, a class.method, or even an unfamiliar but
 * punctuated label — is real enough to show.
 */
export function isMeaningfulEntryPoint(entry: EntryPoint): boolean {
  if (entry.type !== 'Unknown') return true;
  return entry.methodName !== '' || /[.:/\s]/.test(entry.className);
}

/** `Klass.method` / `Klass` — one-line form for compact display and tooltips. */
export function formatEntryPoint(entry: EntryPoint): string {
  if (!entry.className) return '';
  return entry.methodName ? `${entry.className}.${entry.methodName}` : entry.className;
}
