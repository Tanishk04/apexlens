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
    case 'FLOW_CREATE_INTERVIEW_BEGIN':
      return parts[parts.length - 1] || payload || event;
    case 'FLOW_ELEMENT_BEGIN':
    case 'FLOW_BULK_ELEMENT_BEGIN':
      // [..]|<elementType>|<elementName>
      return parts.slice(-2).join(' · ') || payload || event;
    case 'VALIDATION_RULE':
      // <id>|<ruleName>
      return parts[parts.length - 1] || payload || event;
    case 'VALIDATION_FORMULA':
      return parts[0] || payload || event;
    case 'USER_DEBUG':
      // [line]|LEVEL|message
      return parts.length >= 3 ? parts.slice(2).join('|') : parts[parts.length - 1] || payload;
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
