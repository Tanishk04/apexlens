import {
  isEntryEvent,
  isExitEvent,
  isNoiseEvent,
  isBlockEvent,
  isUnrecognizedEvent,
  eventCategory,
  ENTRY_EVENTS,
  EXIT_EVENTS,
  EXIT_TO_ENTRY,
  POINT_EVENTS,
} from '../events';
import type { NodeType } from '../types';

type Bucket = 'entry' | 'exit' | 'point' | 'noise' | 'block' | 'other';

/** Which bucket the registry actually puts an event in. Exactly one must claim it. */
function bucketOf(event: string): Bucket {
  const claims: Bucket[] = [];
  if (isEntryEvent(event)) claims.push('entry');
  if (isExitEvent(event)) claims.push('exit');
  if (POINT_EVENTS.has(event)) claims.push('point');
  if (isNoiseEvent(event)) claims.push('noise');
  if (isBlockEvent(event)) claims.push('block');
  if (claims.length === 0) return 'other';
  // Block events are deliberately also noise (hidden, and their body is dropped).
  if (claims.length === 2 && claims.includes('block') && claims.includes('noise')) return 'block';
  if (claims.length > 1) throw new Error(`${event} claimed by multiple buckets: ${claims.join()}`);
  return claims[0]!;
}

/**
 * Events from Salesforce Help ▸ "Debug Log Levels", with the bucket each MUST
 * land in. This is the regression net for the whole registry: a future edit that
 * moves one of these between buckets — the class of mistake that had
 * SAVEPOINT_SET opening a node and LIMIT_USAGE drawing 15,659 rows — fails here
 * rather than silently corrupting durations or flooding the tree.
 */
const CATALOG: [string, Bucket][] = [
  // --- APEX_CODE ---
  ['CODE_UNIT_STARTED', 'entry'],
  ['CODE_UNIT_FINISHED', 'exit'],
  ['METHOD_ENTRY', 'entry'],
  ['METHOD_EXIT', 'exit'],
  ['CONSTRUCTOR_ENTRY', 'entry'],
  ['CONSTRUCTOR_EXIT', 'exit'],
  ['HEAP_ALLOCATE', 'noise'],
  ['HEAP_DEALLOCATE', 'noise'],
  ['BULK_HEAP_ALLOCATE', 'noise'],
  ['STATEMENT_EXECUTE', 'noise'],
  ['VARIABLE_ASSIGNMENT', 'noise'],
  ['VARIABLE_SCOPE_BEGIN', 'noise'],
  ['VARIABLE_SCOPE_END', 'noise'],
  ['USER_INFO', 'noise'],
  // --- APEX_PROFILING ---
  ['STATIC_VARIABLE_LIST', 'block'],
  ['STACK_FRAME_VARIABLE_LIST', 'block'],
  ['TOTAL_EMAIL_RECIPIENTS_QUEUED', 'noise'],
  // --- CALLOUT ---
  ['CALLOUT_REQUEST', 'entry'],
  ['CALLOUT_RESPONSE', 'exit'],
  ['NAMED_CREDENTIAL_REQUEST', 'entry'],
  ['NAMED_CREDENTIAL_RESPONSE', 'exit'],
  // --- DB ---
  ['SOQL_EXECUTE_BEGIN', 'entry'],
  ['SOQL_EXECUTE_END', 'exit'],
  ['SOSL_EXECUTE_BEGIN', 'entry'],
  ['SOSL_EXECUTE_END', 'exit'],
  ['DML_BEGIN', 'entry'],
  ['DML_END', 'exit'],
  ['CURSOR_CREATE_BEGIN', 'entry'],
  ['CURSOR_CREATE_END', 'exit'],
  ['QUERY_MORE_BEGIN', 'entry'],
  ['QUERY_MORE_END', 'exit'],
  ['SAVEPOINT_SET', 'point'],
  ['SAVEPOINT_ROLLBACK', 'point'],
  // Undocumented but ubiquitous: one per statement at APEX_PROFILING,FINEST.
  ['LIMIT_USAGE', 'noise'],
  // --- NBA ---
  ['NBA_NODE_BEGIN', 'entry'],
  ['NBA_NODE_END', 'exit'],
  ['NBA_STRATEGY_BEGIN', 'entry'],
  ['NBA_STRATEGY_END', 'exit'],
  // --- SYSTEM ---
  ['SYSTEM_METHOD_ENTRY', 'entry'],
  ['SYSTEM_METHOD_EXIT', 'exit'],
  ['SYSTEM_CONSTRUCTOR_ENTRY', 'entry'],
  ['SYSTEM_CONSTRUCTOR_EXIT', 'exit'],
  ['SYSTEM_MODE_ENTER', 'noise'],
  ['SYSTEM_MODE_EXIT', 'noise'],
  // --- VISUALFORCE ---
  ['VF_APEX_CALL_START', 'entry'],
  ['VF_APEX_CALL_END', 'exit'],
  ['VF_DESERIALIZE_VIEWSTATE_BEGIN', 'entry'],
  ['VF_DESERIALIZE_VIEWSTATE_END', 'exit'],
  ['VF_SERIALIZE_VIEWSTATE_BEGIN', 'entry'],
  ['VF_SERIALIZE_VIEWSTATE_END', 'exit'],
  ['VF_EVALUATE_FORMULA_BEGIN', 'entry'],
  ['VF_EVALUATE_FORMULA_END', 'exit'],
  // --- WORKFLOW ---
  ['FLOW_START_INTERVIEWS_BEGIN', 'entry'],
  ['FLOW_START_INTERVIEWS_END', 'exit'],
  ['FLOW_START_INTERVIEW_BEGIN', 'entry'],
  ['FLOW_START_INTERVIEW_END', 'exit'],
  ['FLOW_CREATE_INTERVIEW_BEGIN', 'entry'],
  ['FLOW_CREATE_INTERVIEW_END', 'exit'],
  ['FLOW_ELEMENT_BEGIN', 'entry'],
  ['FLOW_ELEMENT_END', 'exit'],
  ['FLOW_BULK_ELEMENT_BEGIN', 'entry'],
  ['FLOW_BULK_ELEMENT_END', 'exit'],
  ['WF_RULE_EVAL_BEGIN', 'entry'],
  ['WF_RULE_EVAL_END', 'exit'],
  ['WF_CRITERIA_BEGIN', 'entry'],
  ['WF_CRITERIA_END', 'exit'],
  ['WF_FLOW_ACTION_BEGIN', 'entry'],
  ['WF_FLOW_ACTION_END', 'exit'],
  ['EVENT_SERVICE_PUB_BEGIN', 'entry'],
  ['EVENT_SERVICE_PUB_END', 'exit'],
  ['EVENT_SERVICE_SUB_BEGIN', 'entry'],
  ['EVENT_SERVICE_SUB_END', 'exit'],
  ['DUPLICATE_DETECTION_BEGIN', 'entry'],
  ['DUPLICATE_DETECTION_END', 'exit'],
  // Point events whose names imply pairing but have no counterpart in the docs.
  ['WF_APPROVAL', 'point'],
  ['WF_APPROVAL_SUBMIT', 'point'],
  ['WF_APPROVAL_SUBMITTER', 'point'],
  ['WF_APPROVAL_REMOVE', 'point'],
  ['WF_TIME_TRIGGERS_BEGIN', 'point'],
  ['WF_SPOOL_ACTION_BEGIN', 'point'],
  ['WF_ACTIONS_END', 'point'],
  ['SLA_END', 'point'],
];

describe('event registry buckets (documented catalog)', () => {
  it.each(CATALOG)('%s is bucketed as %s', (event, expected) => {
    expect(bucketOf(event)).toBe(expected);
  });

  it('claims every catalog event exactly once', () => {
    // bucketOf throws on an overlap; this asserts none is left unclaimed either.
    expect(CATALOG.filter(([e]) => bucketOf(e) === 'other')).toEqual([]);
  });
});

describe('entry/exit pairing integrity', () => {
  it('maps every exit to an entry the registry actually knows', () => {
    for (const [exit, entry] of Object.entries(EXIT_TO_ENTRY)) {
      expect(isExitEvent(exit)).toBe(true);
      expect(entry in ENTRY_EVENTS).toBe(true);
    }
  });

  it('never lets a point event be treated as an entry or an exit', () => {
    for (const event of POINT_EVENTS) {
      expect(isEntryEvent(event)).toBe(false);
      expect(isExitEvent(event)).toBe(false);
    }
  });

  it('keeps ENTRY_EVENTS and EXIT_EVENTS disjoint', () => {
    for (const entry of Object.keys(ENTRY_EVENTS)) {
      expect(EXIT_EVENTS.has(entry)).toBe(false);
    }
  });
});

describe('eventCategory families', () => {
  const cases: [string, NodeType][] = [
    ['SOQL_EXECUTE_EXPLAIN', 'SOQL'],
    ['IDEAS_QUERY_EXECUTE', 'SOQL'],
    ['CURSOR_FETCH', 'SOQL'],
    ['QUERY_MORE_ITERATIONS', 'SOQL'],
    ['SOSL_EXECUTE_BEGIN', 'SOSL'],
    ['DML_BEGIN', 'DML'],
    ['XDS_RESPONSE', 'CALLOUT'],
    ['XDS_RESPONSE_ERROR', 'CALLOUT'],
    ['NAMED_CREDENTIAL_REQUEST', 'CALLOUT'],
    ['SLA_PROCESS_CASE', 'WORKFLOW'],
    ['EVENT_SERVICE_PUB_DETAIL', 'WORKFLOW'],
    ['WF_FIELD_UPDATE', 'WORKFLOW'],
    ['FLOW_VALUE_ASSIGNMENT', 'FLOW'],
    ['FLOW_ELEMENT_LIMIT_USAGE', 'FLOW'],
    ['VF_PAGE_MESSAGE', 'VF'],
    ['VALIDATION_RULE', 'VALIDATION'],
    ['PUSH_NOTIFICATION_SENT', 'SYSTEM'],
    ['EMAIL_QUEUE', 'SYSTEM'],
  ];

  it.each(cases)('%s → %s', (event, expected) => {
    expect(eventCategory(event)).toBe(expected);
  });

  it('falls back to GENERIC only for events matching no family', () => {
    expect(eventCategory('ZZZ_FUTURE_EVENT')).toBe('GENERIC');
    expect(isUnrecognizedEvent('ZZZ_FUTURE_EVENT')).toBe(true);
  });

  it('does not report registry-known events as unrecognized', () => {
    for (const [event] of CATALOG) {
      expect(isUnrecognizedEvent(event)).toBe(false);
    }
    // Explicitly handled by the tree builder, though eventCategory has no family.
    for (const event of ['USER_DEBUG', 'EXCEPTION_THROWN', 'FATAL_ERROR']) {
      expect(isUnrecognizedEvent(event)).toBe(false);
    }
  });
});
