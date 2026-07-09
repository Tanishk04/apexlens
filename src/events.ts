import type { NodeType } from './types';

/**
 * Central Salesforce debug-log event registry.
 *
 * Salesforce trace flags combine 9 categories (Database, Workflow, NBA,
 * Validation, Callout, Apex Code, Apex Profiling, Visualforce, System) at 8
 * cumulative levels. Every combination emits a different set of events, so the
 * parser is driven by this catalog rather than ad-hoc string matching.
 *
 * Design rules:
 *  - ENTRY_EVENTS / EXIT pairing builds the execution tree. Salesforce logs are
 *    well nested, so on an exit we pop the top of the stack regardless of exact
 *    name match — this tolerates missing/renamed exit events across API versions.
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
  WF_RULE_EVAL_BEGIN: 'WORKFLOW',
  WF_CRITERIA_BEGIN: 'WORKFLOW',
  WF_APPROVAL_SUBMIT: 'WORKFLOW',
  DUPLICATE_DETECTION_BEGIN: 'SYSTEM',
  SAVEPOINT_SET: 'SYSTEM',
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
  'WF_RULE_EVAL_END',
  'WF_CRITERIA_END',
  'DUPLICATE_DETECTION_END',
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

/** Low-signal events hidden from the tree by default. */
export const NOISE_EVENTS: Set<string> = new Set([
  'HEAP_ALLOCATE',
  'HEAP_DEALLOCATE',
  'STATEMENT_EXECUTE',
  'VARIABLE_SCOPE_BEGIN',
  'VARIABLE_SCOPE_END',
  'VARIABLE_ASSIGNMENT',
  'SYSTEM_MODE_ENTER',
  'SYSTEM_MODE_EXIT',
  'USER_INFO',
  'ENTERING_MANAGED_PKG',
]);

export function isEntryEvent(event: string): boolean {
  if (NON_PAIR_EVENTS.has(event) || NOISE_EVENTS.has(event)) return false;
  if (event in ENTRY_EVENTS) return true;
  // Generic fallback for future API events.
  return event.endsWith('_ENTRY') || event.endsWith('_BEGIN') || event.endsWith('_STARTED');
}

export function isExitEvent(event: string): boolean {
  if (NON_PAIR_EVENTS.has(event) || NOISE_EVENTS.has(event)) return false;
  if (EXIT_EVENTS.has(event)) return true;
  return event.endsWith('_EXIT') || event.endsWith('_END') || event.endsWith('_FINISHED');
}

export function isNoiseEvent(event: string): boolean {
  return NOISE_EVENTS.has(event);
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

/** Coarse category for any event (used for filtering / coloring). */
export function eventCategory(event: string): NodeType {
  if (event.includes('SOSL')) return 'SOSL';
  if (event.includes('SOQL')) return 'SOQL';
  if (event.includes('DML')) return 'DML';
  if (event.includes('CALLOUT') || event.includes('CREDENTIAL')) return 'CALLOUT';
  if (event.includes('VALIDATION')) return 'VALIDATION';
  if (event.startsWith('FLOW')) return 'FLOW';
  if (event.startsWith('WF') || event.includes('WORKFLOW')) return 'WORKFLOW';
  if (event.startsWith('VF')) return 'VF';
  if (event.includes('METHOD') || event.includes('CONSTRUCTOR')) return 'METHOD';
  if (event.includes('CODE_UNIT')) return 'CODE_UNIT';
  if (event.startsWith('SYSTEM')) return 'SYSTEM';
  return 'GENERIC';
}
