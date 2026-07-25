import type { NodeType } from './types';

/**
 * Central Salesforce debug-log event registry.
 *
 * Salesforce trace flags combine log categories (Apex Code, Apex Profiling,
 * Callout, Database, NBA, System, Validation, Visualforce, Workflow, plus the
 * newer Data Access and Wave) at 8 cumulative levels. Every combination emits a
 * different set of events, so the parser is driven by this catalog rather than
 * ad-hoc string matching.
 *
 * Event names and their category/level are taken from Salesforce Help ▸ "Debug
 * Log Levels" (the category × level matrix). Two caveats that shape the design
 * below:
 *  - The published table is NOT complete. `LIMIT_USAGE`, for example, is emitted
 *    once per statement under APEX_PROFILING,FINEST and appears nowhere in the
 *    docs; the Wave and Data Access event lists are unpublished entirely.
 *  - Therefore the registry can never be assumed exhaustive. The parser tracks
 *    events it could neither classify nor recognise (see `unrecognizedEvents` on
 *    ParsedDebugLog) so real logs, not documentation, drive future additions.
 *
 * Design rules:
 *  - ENTRY_EVENTS / EXIT_EVENTS pairing builds the execution tree. Exits prefer
 *    the nearest stack node whose event matches via EXIT_TO_ENTRY; only exits
 *    with no mapping fall back to popping the top, which keeps tolerance for
 *    renamed/future exits without letting a known-unpaired event desync the tree.
 *  - POINT_EVENTS look like entries/exits by suffix but open and close nothing.
 *    Getting one of these wrong silently corrupts every duration that follows.
 *  - BLOCK_EVENTS are followed by untimestamped body lines that belong to the
 *    block, not to the preceding statement or exception.
 *  - BLOCK/META events (limits, profiling, execution markers) never push/pop.
 *  - Anything unknown falls through to a GENERIC node/statement and still renders.
 */

/** Entry events that open an execution node, mapped to a coarse node type. */
export const ENTRY_EVENTS: Record<string, NodeType> = {
  CODE_UNIT_STARTED: 'CODE_UNIT',
  METHOD_ENTRY: 'METHOD',
  CONSTRUCTOR_ENTRY: 'METHOD',
  SYSTEM_METHOD_ENTRY: 'SYSTEM',
  SYSTEM_CONSTRUCTOR_ENTRY: 'SYSTEM',
  SOQL_EXECUTE_BEGIN: 'SOQL',
  SOSL_EXECUTE_BEGIN: 'SOSL',
  DML_BEGIN: 'DML',
  CALLOUT_REQUEST: 'CALLOUT',
  NAMED_CREDENTIAL_REQUEST: 'CALLOUT',
  FLOW_START_INTERVIEWS_BEGIN: 'FLOW',
  FLOW_START_INTERVIEW_BEGIN: 'FLOW',
  FLOW_CREATE_INTERVIEW_BEGIN: 'FLOW',
  FLOW_ELEMENT_BEGIN: 'FLOW',
  FLOW_BULK_ELEMENT_BEGIN: 'FLOW',
  VF_APEX_CALL_START: 'VF',
  VF_DESERIALIZE_VIEWSTATE_BEGIN: 'VF',
  VF_SERIALIZE_VIEWSTATE_BEGIN: 'VF',
  VF_EVALUATE_FORMULA_BEGIN: 'VF',
  WF_RULE_EVAL_BEGIN: 'WORKFLOW',
  WF_CRITERIA_BEGIN: 'WORKFLOW',
  WF_FLOW_ACTION_BEGIN: 'WORKFLOW',
  EVENT_SERVICE_PUB_BEGIN: 'WORKFLOW',
  EVENT_SERVICE_SUB_BEGIN: 'WORKFLOW',
  DUPLICATE_DETECTION_BEGIN: 'SYSTEM',
  CURSOR_CREATE_BEGIN: 'SOQL',
  QUERY_MORE_BEGIN: 'SOQL',
  NBA_NODE_BEGIN: 'GENERIC',
  NBA_STRATEGY_BEGIN: 'GENERIC',
};

/** Exit events that close the top execution node. */
export const EXIT_EVENTS: Set<string> = new Set([
  'CODE_UNIT_FINISHED',
  'METHOD_EXIT',
  'CONSTRUCTOR_EXIT',
  'SYSTEM_METHOD_EXIT',
  'SYSTEM_CONSTRUCTOR_EXIT',
  'SOQL_EXECUTE_END',
  'SOSL_EXECUTE_END',
  'DML_END',
  'CALLOUT_RESPONSE',
  'NAMED_CREDENTIAL_RESPONSE',
  'FLOW_START_INTERVIEWS_END',
  'FLOW_START_INTERVIEW_END',
  'FLOW_CREATE_INTERVIEW_END',
  'FLOW_ELEMENT_END',
  'FLOW_BULK_ELEMENT_END',
  'VF_APEX_CALL_END',
  'VF_DESERIALIZE_VIEWSTATE_END',
  'VF_SERIALIZE_VIEWSTATE_END',
  'VF_EVALUATE_FORMULA_END',
  'WF_RULE_EVAL_END',
  'WF_CRITERIA_END',
  'WF_FLOW_ACTION_END',
  'EVENT_SERVICE_PUB_END',
  'EVENT_SERVICE_SUB_END',
  'DUPLICATE_DETECTION_END',
  'CURSOR_CREATE_END',
  'QUERY_MORE_END',
  'NBA_NODE_END',
  'NBA_STRATEGY_END',
]);

/**
 * Exit event → the entry event it closes. Used to pop the *matching* node
 * instead of blindly popping the stack top, so one unpaired event can't shift
 * every subsequent duration by a level. Exits absent from this map keep the
 * old pop-the-top behaviour (tolerance for future/renamed API events).
 */
export const EXIT_TO_ENTRY: Record<string, string> = {
  CODE_UNIT_FINISHED: 'CODE_UNIT_STARTED',
  METHOD_EXIT: 'METHOD_ENTRY',
  CONSTRUCTOR_EXIT: 'CONSTRUCTOR_ENTRY',
  SYSTEM_METHOD_EXIT: 'SYSTEM_METHOD_ENTRY',
  SYSTEM_CONSTRUCTOR_EXIT: 'SYSTEM_CONSTRUCTOR_ENTRY',
  SOQL_EXECUTE_END: 'SOQL_EXECUTE_BEGIN',
  SOSL_EXECUTE_END: 'SOSL_EXECUTE_BEGIN',
  DML_END: 'DML_BEGIN',
  CALLOUT_RESPONSE: 'CALLOUT_REQUEST',
  NAMED_CREDENTIAL_RESPONSE: 'NAMED_CREDENTIAL_REQUEST',
  FLOW_START_INTERVIEWS_END: 'FLOW_START_INTERVIEWS_BEGIN',
  FLOW_START_INTERVIEW_END: 'FLOW_START_INTERVIEW_BEGIN',
  FLOW_CREATE_INTERVIEW_END: 'FLOW_CREATE_INTERVIEW_BEGIN',
  FLOW_ELEMENT_END: 'FLOW_ELEMENT_BEGIN',
  FLOW_BULK_ELEMENT_END: 'FLOW_BULK_ELEMENT_BEGIN',
  VF_APEX_CALL_END: 'VF_APEX_CALL_START',
  VF_DESERIALIZE_VIEWSTATE_END: 'VF_DESERIALIZE_VIEWSTATE_BEGIN',
  VF_SERIALIZE_VIEWSTATE_END: 'VF_SERIALIZE_VIEWSTATE_BEGIN',
  VF_EVALUATE_FORMULA_END: 'VF_EVALUATE_FORMULA_BEGIN',
  WF_RULE_EVAL_END: 'WF_RULE_EVAL_BEGIN',
  WF_CRITERIA_END: 'WF_CRITERIA_BEGIN',
  WF_FLOW_ACTION_END: 'WF_FLOW_ACTION_BEGIN',
  EVENT_SERVICE_PUB_END: 'EVENT_SERVICE_PUB_BEGIN',
  EVENT_SERVICE_SUB_END: 'EVENT_SERVICE_SUB_BEGIN',
  DUPLICATE_DETECTION_END: 'DUPLICATE_DETECTION_BEGIN',
  CURSOR_CREATE_END: 'CURSOR_CREATE_BEGIN',
  QUERY_MORE_END: 'QUERY_MORE_BEGIN',
  NBA_NODE_END: 'NBA_NODE_BEGIN',
  NBA_STRATEGY_END: 'NBA_STRATEGY_BEGIN',
};

/**
 * Events whose NAME looks like an entry or an exit but that open and close
 * nothing — they mark a single instant. Left unlisted, each one either pushes a
 * node nothing ever pops (so every later sibling nests under it) or pops a node
 * it never opened; because exits tolerate name mismatches, that off-by-one then
 * persists for the rest of the transaction.
 *
 * All of the below are documented with no counterpart in the Debug Log Levels
 * matrix: `SAVEPOINT_SET`/`SAVEPOINT_ROLLBACK` (DB, INFO+) sit beside genuine
 * BEGIN/END pairs but have none; the `WF_APPROVAL*` family, `WF_ACTIONS_END`
 * (there is no WF_ACTIONS_BEGIN) and `SLA_END` (no SLA_BEGIN) likewise.
 */
export const POINT_EVENTS: Set<string> = new Set([
  'SAVEPOINT_SET',
  'SAVEPOINT_ROLLBACK',
  'WF_APPROVAL',
  'WF_APPROVAL_REMOVE',
  'WF_APPROVAL_SUBMIT',
  'WF_APPROVAL_SUBMITTER',
  'WF_TIME_TRIGGERS_BEGIN',
  'WF_SPOOL_ACTION_BEGIN',
  'WF_ACTIONS_END',
  'SLA_END',
]);

/**
 * Events followed by untimestamped body lines that belong to the block itself.
 * Without this the body is appended to whatever statement or exception came
 * last — a single STATIC_VARIABLE_LIST can bolt ~35 lines of variable dump onto
 * an unrelated row, or onto an earlier exception's stack trace.
 */
export const BLOCK_EVENTS: Set<string> = new Set([
  'STATIC_VARIABLE_LIST',
  'STACK_FRAME_VARIABLE_LIST',
]);

/**
 * Events that look like entry/exit (by suffix) but are blocks or markers, not
 * execution nesting. These must never push/pop the stack.
 */
export const NON_PAIR_EVENTS: Set<string> = new Set([
  'EXECUTION_STARTED',
  'EXECUTION_FINISHED',
  'CUMULATIVE_LIMIT_USAGE',
  'CUMULATIVE_LIMIT_USAGE_END',
  'CUMULATIVE_PROFILING',
  'CUMULATIVE_PROFILING_BEGIN',
  'CUMULATIVE_PROFILING_END',
  'LIMIT_USAGE_FOR_NS',
  'TESTING_LIMITS',
  'FLOW_INTERVIEW_FINISHED_LIMIT_USAGE',
]);

/** Multi-line governor-limit blocks whose body follows on untimestamped lines. */
export const LIMIT_BLOCK_STARTS: Set<string> = new Set([
  'CUMULATIVE_LIMIT_USAGE',
  'LIMIT_USAGE_FOR_NS',
  'TESTING_LIMITS',
]);

/**
 * Low-signal events hidden from the tree by default: per-statement meters and
 * profiling dumps that carry no execution structure. They still appear in Raw
 * Tree, which deliberately shows every line.
 *
 * `LIMIT_USAGE` is the highest-volume member by far — one per statement under
 * APEX_PROFILING,FINEST (15,659 across the five reference logs in `test_logs/`,
 * which was 77% of every row the Execution Tree drew). It is undocumented;
 * `BULK_HEAP_ALLOCATE` is documented (APEX_CODE, FINEST) and was simply missing
 * next to its HEAP_ALLOCATE/HEAP_DEALLOCATE siblings.
 */
export const NOISE_EVENTS: Set<string> = new Set([
  'HEAP_ALLOCATE',
  'HEAP_DEALLOCATE',
  'BULK_HEAP_ALLOCATE',
  'STATEMENT_EXECUTE',
  'VARIABLE_SCOPE_BEGIN',
  'VARIABLE_SCOPE_END',
  'VARIABLE_ASSIGNMENT',
  'SYSTEM_MODE_ENTER',
  'SYSTEM_MODE_EXIT',
  'USER_INFO',
  'ENTERING_MANAGED_PKG',
  'LIMIT_USAGE',
  'TOTAL_EMAIL_RECIPIENTS_QUEUED',
  'STATIC_VARIABLE_LIST',
  'STACK_FRAME_VARIABLE_LIST',
]);

export function isEntryEvent(event: string): boolean {
  if (POINT_EVENTS.has(event) || NON_PAIR_EVENTS.has(event) || NOISE_EVENTS.has(event))
    return false;
  if (event in ENTRY_EVENTS) return true;
  // Generic fallback for future API events.
  return event.endsWith('_ENTRY') || event.endsWith('_BEGIN') || event.endsWith('_STARTED');
}

export function isExitEvent(event: string): boolean {
  if (POINT_EVENTS.has(event) || NON_PAIR_EVENTS.has(event) || NOISE_EVENTS.has(event))
    return false;
  if (EXIT_EVENTS.has(event)) return true;
  return event.endsWith('_EXIT') || event.endsWith('_END') || event.endsWith('_FINISHED');
}

export function isNoiseEvent(event: string): boolean {
  return NOISE_EVENTS.has(event);
}

/** True if this event's untimestamped body lines belong to it, not to the previous row. */
export function isBlockEvent(event: string): boolean {
  return BLOCK_EVENTS.has(event);
}

/** Node type for an entry event, with a sensible generic default. */
export function entryNodeType(event: string): NodeType {
  if (event in ENTRY_EVENTS) return ENTRY_EVENTS[event]!;
  if (event.startsWith('FLOW')) return 'FLOW';
  if (event.startsWith('WF')) return 'WORKFLOW';
  if (event.startsWith('VF')) return 'VF';
  if (event.startsWith('SYSTEM')) return 'SYSTEM';
  return 'GENERIC';
}

/**
 * Coarse category for any event (used for filtering / coloring).
 *
 * Prefix rules rather than per-event rows, so undocumented siblings of a known
 * family classify themselves. Anything that reaches the end is genuinely
 * unrecognised and is counted as such by the parser — GENERIC is a real signal,
 * not a dumping ground.
 */
export function eventCategory(event: string): NodeType {
  if (event.includes('SOSL')) return 'SOSL';
  if (event.includes('SOQL')) return 'SOQL';
  if (event.includes('DML')) return 'DML';
  if (event.includes('CALLOUT') || event.includes('CREDENTIAL')) return 'CALLOUT';
  if (event.includes('VALIDATION')) return 'VALIDATION';
  if (event.startsWith('FLOW')) return 'FLOW';
  if (
    event.startsWith('WF') ||
    event.includes('WORKFLOW') ||
    event.startsWith('SLA_') ||
    event.startsWith('EVENT_SERVICE_')
  )
    return 'WORKFLOW';
  if (event.startsWith('VF')) return 'VF';
  if (event.includes('METHOD') || event.includes('CONSTRUCTOR')) return 'METHOD';
  if (event.includes('CODE_UNIT')) return 'CODE_UNIT';
  // Cursors, pagination and Ideas queries are all database reads.
  if (
    event.startsWith('CURSOR_') ||
    event.startsWith('QUERY_MORE') ||
    event.startsWith('IDEAS_QUERY')
  )
    return 'SOQL';
  // XDS_* is external-data-source traffic — a callout in all but name.
  if (event.startsWith('XDS_')) return 'CALLOUT';
  if (event.startsWith('PUSH_NOTIFICATION') || event.startsWith('EMAIL_')) return 'SYSTEM';
  if (event.startsWith('SYSTEM')) return 'SYSTEM';
  return 'GENERIC';
}

/**
 * Documented events that legitimately have no NodeType family, so they resolve
 * to GENERIC on purpose. Listing them keeps the unrecognised-event tally a true
 * "we have never seen this" signal rather than a list of known gaps.
 */
const KNOWN_UNCATEGORIZED: Set<string> = new Set([
  // Handled explicitly by TreeBuilder.processToken, so they never reach the
  // GENERIC fallthrough even though eventCategory has no family for them.
  'USER_DEBUG',
  'EXCEPTION_THROWN',
  'FATAL_ERROR',
  // NBA (Next Best Action) — documented, but has no colour family of its own.
  'NBA_NODE_BEGIN',
  'NBA_NODE_DETAIL',
  'NBA_NODE_END',
  'NBA_NODE_ERROR',
  'NBA_OFFER_INVALID',
  'NBA_STRATEGY_BEGIN',
  'NBA_STRATEGY_END',
  'NBA_STRATEGY_ERROR',
  'POP_TRACE_FLAGS',
  'PUSH_TRACE_FLAGS',
  'DUPLICATE_DETECTION_RULE_INVOCATION',
]);

/**
 * True when `eventCategory` had to fall back to GENERIC *and* the event is in
 * none of the registry sets — i.e. we have genuinely never seen it. Drives the
 * parser's unrecognised-event tally, which is how registry gaps become visible
 * instead of silently inflating GENERIC.
 */
export function isUnrecognizedEvent(event: string): boolean {
  if (NOISE_EVENTS.has(event) || NON_PAIR_EVENTS.has(event) || POINT_EVENTS.has(event))
    return false;
  if (BLOCK_EVENTS.has(event) || KNOWN_UNCATEGORIZED.has(event)) return false;
  if (event in ENTRY_EVENTS || EXIT_EVENTS.has(event)) return false;
  return eventCategory(event) === 'GENERIC';
}
