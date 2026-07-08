/** Events hidden by default — low signal for debugging. */
const NOISE_EVENTS = new Set([
  'HEAP_ALLOCATE',
  'STATEMENT_EXECUTE',
  'VARIABLE_SCOPE_BEGIN',
  'VARIABLE_ASSIGNMENT',
  'SYSTEM_MODE_ENTER',
  'SYSTEM_MODE_EXIT',
  'USER_INFO',
  'CUMULATIVE_LIMIT_USAGE',
  'CUMULATIVE_LIMIT_USAGE_END',
]);

/** Exit events — duration is shown on the matching entry. */
const EXIT_EVENT_NAMES = new Set([
  'METHOD_EXIT',
  'CONSTRUCTOR_EXIT',
  'CODE_UNIT_FINISHED',
  'SOQL_EXECUTE_END',
  'DML_END',
  'CALLOUT_RESPONSE',
  'EXECUTION_FINISHED',
  'FLOW_ELEMENT_ERROR',
]);

const ENTRY_EVENTS = new Set([
  'CODE_UNIT_STARTED',
  'METHOD_ENTRY',
  'CONSTRUCTOR_ENTRY',
  'SOQL_EXECUTE_BEGIN',
  'DML_BEGIN',
  'CALLOUT_REQUEST',
]);

export function isNoiseEvent(event: string): boolean {
  return NOISE_EVENTS.has(event) || event.includes('LIMIT_USAGE');
}

export function isExitEvent(event: string): boolean {
  if (event === 'EXECUTION_FINISHED') return true;
  return EXIT_EVENT_NAMES.has(event) || event.endsWith('_EXIT');
}

export function isEntryEvent(event: string): boolean {
  if (event === 'EXECUTION_STARTED' || event === 'EXECUTION_FINISHED') return false;
  if (ENTRY_EVENTS.has(event)) return true;
  return event.startsWith('FLOW_START_');
}

export function shouldDisplayEvent(event: string, showDebug = false): boolean {
  if (isNoiseEvent(event)) return false;
  if (isExitEvent(event)) return false;
  if (event === 'EXECUTION_STARTED' || event === 'EXECUTION_FINISHED') return false;
  if (!showDebug && event === 'USER_DEBUG') return false;
  return true;
}

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
      return parts[parts.length - 1] || payload || event;
    case 'SOQL_EXECUTE_BEGIN': {
      const queryStart = parts.findIndex((part) => /^SELECT\b/i.test(part));
      if (queryStart >= 0) return parts.slice(queryStart).join('|');
      return parts[parts.length - 1] || payload || event;
    }
    case 'USER_DEBUG':
      return parts.length >= 3 ? parts.slice(2).join('|') : parts[parts.length - 1] || payload;
    case 'EXCEPTION_THROWN':
    case 'FATAL_ERROR':
      return payload || event;
    case 'DML_BEGIN':
    case 'CALLOUT_REQUEST':
      return parts[parts.length - 1] || payload || event;
    default:
      if (parts.length === 0) return event;
      return parts[parts.length - 1];
  }
}

export function mapEventCategory(event: string): string {
  if (event.includes('SOQL')) return 'SOQL';
  if (event.includes('METHOD') || event.includes('CONSTRUCTOR')) return 'METHOD';
  if (event.includes('FLOW')) return 'FLOW';
  if (event.includes('DML')) return 'DML';
  if (event.includes('CALLOUT')) return 'CALLOUT';
  if (event.includes('EXCEPTION') || event.includes('FATAL')) return 'EXCEPTION';
  if (event.includes('DEBUG')) return 'DEBUG';
  if (event.includes('CODE_UNIT')) return 'CODE_UNIT';
  return 'SYSTEM';
}
