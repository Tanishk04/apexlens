import {
  eventCategory,
  isEntryEvent,
  isExitEvent,
  isNoiseEvent,
} from './events';

export { isEntryEvent, isExitEvent, isNoiseEvent };

/** True if an event should appear as a row in the tree/list by default. */
export function shouldDisplayEvent(event: string, showDebug = false): boolean {
  if (isNoiseEvent(event)) return false;
  if (isExitEvent(event)) return false;
  if (event === 'EXECUTION_STARTED' || event === 'EXECUTION_FINISHED') return false;
  if (!showDebug && event === 'USER_DEBUG') return false;
  return true;
}

/** Coarse category string used by the UI for coloring/filtering. */
export function mapEventCategory(event: string): string {
  return eventCategory(event);
}

/**
 * Produce a short, human-friendly label for a log event from its raw payload.
 * The payload is the pipe-delimited remainder after `time|EVENT`.
 */
export function formatEventLabel(event: string, payload: string): string {
  const parts = payload.split('|').filter((part) => part.length > 0);

  switch (event) {
    case 'CODE_UNIT_STARTED': {
      const apex = parts.find((part) => part.startsWith('apex://'));
      if (apex) return apex.replace('apex://', '');
      return parts[parts.length - 1] || payload || event;
    }
    case 'METHOD_ENTRY':
    case 'CONSTRUCTOR_ENTRY':
    case 'SYSTEM_METHOD_ENTRY':
    case 'SYSTEM_CONSTRUCTOR_ENTRY':
      return parts[parts.length - 1] || payload || event;
    case 'SOQL_EXECUTE_BEGIN':
    case 'SOSL_EXECUTE_BEGIN': {
      const queryStart = parts.findIndex((part) => /^SELECT\b|^FIND\b/i.test(part));
      if (queryStart >= 0) return parts.slice(queryStart).join('|');
      return parts[parts.length - 1] || payload || event;
    }
    case 'DML_BEGIN': {
      // [line]|Op:Insert|Type:Account|Rows:1
      const op = parts.find((p) => p.startsWith('Op:'))?.slice(3);
      const type = parts.find((p) => p.startsWith('Type:'))?.slice(5);
      const rows = parts.find((p) => p.startsWith('Rows:'))?.slice(5);
      if (op || type) return `${op ?? 'DML'} ${type ?? ''}${rows ? ` (${rows} rows)` : ''}`.trim();
      return payload || event;
    }
    case 'FLOW_START_INTERVIEW_BEGIN':
      return parts[parts.length - 1] || payload || event;
    case 'FLOW_CREATE_INTERVIEW_BEGIN':
      // Payload is bare internal IDs (org/flow-version/flow-definition) — no
      // name field exists in this event at all, unlike FLOW_START_INTERVIEW_BEGIN
      // just above. The default last-field formatter surfaced one of those IDs
      // as if it were a name (reported from a real log as an Execution Tree row
      // and an Execution Analysis row both literally named a raw 18-char ID).
      // There is nothing to extract, so label what the event is instead.
      return 'Create Interview';
    case 'FLOW_START_INTERVIEWS_BEGIN':
      // Payload is a bare interview *count* (e.g. "1", "6"), not a name —
      // reported from a real log as rows literally named "1". The count is
      // genuinely useful, so it's kept, just labelled as what it counts.
      return parts[0] ? `Start Interviews (${parts[0]})` : 'Start Interviews';
    case 'FLOW_ELEMENT_BEGIN':
    case 'FLOW_BULK_ELEMENT_BEGIN':
      // [..]|<elementType>|<elementName>
      return parts.slice(-2).join(' · ') || payload || event;
    case 'VALIDATION_RULE':
      // <id>|<ruleName>
      return parts[parts.length - 1] || payload || event;
    case 'VALIDATION_FORMULA':
      return parts[0] || payload || event;
    case 'WF_CRITERIA_BEGIN':
      // [object desc]|<rule name>|<rule id>|<criteria type>|<eval order>
      // The default (last-field) formatter was showing the eval order — always
      // a small integer, "0" in every log seen — instead of the rule name.
      return (parts.length >= 5 ? parts[1] : parts[parts.length - 1]) || payload || event;
    case 'WF_FLOW_ACTION_BEGIN':
      // Payload is a bare flow-action id with no name field at all — unlike
      // most WF_* events there is nothing else to extract. Label it rather than
      // show a meaningless id on its own, but keep the id: several distinct flow
      // actions in one log otherwise collapse into a single indistinguishable
      // "Flow Action" group in the Analysis tables.
      return parts[0] ? `Flow Action ${parts[0]}` : payload || event;
    case 'USER_DEBUG':
      // Payload is LEVEL|message — the Lexer already captured the `[line]` token
      // into LogToken.lineNumber, so it is NOT part of `payload` here. Keeping
      // every field after the level matters because messages legitimately contain
      // pipes (serialized records, delimited dumps); slicing from 2 silently ate
      // the first segment of those.
      return parts.length >= 2 ? parts.slice(1).join('|') : parts[parts.length - 1] || payload;
    case 'CALLOUT_REQUEST':
    case 'CALLOUT_RESPONSE':
    case 'NAMED_CREDENTIAL_REQUEST':
      return parts[parts.length - 1] || payload || event;
    case 'EXCEPTION_THROWN':
    case 'FATAL_ERROR':
      return payload || event;
    default:
      if (parts.length === 0) return event;
      return parts[parts.length - 1]!;
  }
}
