/**
 * Node categories. Kept intentionally coarse so the UI can color/group by a
 * small, stable set. Unknown events map to GENERIC and still render.
 */
export type NodeType =
  | 'CODE_UNIT'
  | 'METHOD'
  | 'TRIGGER'
  | 'FLOW'
  | 'WORKFLOW'
  | 'SOQL'
  | 'SOSL'
  | 'DML'
  | 'CALLOUT'
  | 'VALIDATION'
  | 'VF'
  | 'SYSTEM'
  | 'GENERIC';

/** One category/level pair from the log header trace-flag config. */
export interface TraceConfig {
  category: string;
  level: string;
}

export interface LogHeader {
  version: string;
  timestamp: string;
  /** Legacy flat map (category -> level); kept for back-compat. */
  traceFlags: Record<string, string>;
  /** Parsed header config, e.g. APEX_CODE,DEBUG;APEX_PROFILING,INFO. */
  categories: TraceConfig[];
}

export type StatementType =
  | 'DEBUG'
  | 'ASSIGNMENT'
  | 'STATEMENT'
  | 'EXCEPTION'
  | 'VALIDATION'
  | 'GENERIC';

export interface StatementEvent {
  id: string;
  type: StatementType;
  event: string; // raw Salesforce event name
  timestamp: number;
  lineNumber: number;
  text: string;
  /** For VALIDATION_* statements. */
  validationResult?: 'PASS' | 'FAIL';
}

export interface FlowNodeDetails {
  flowName: string;
  elementType: string;
  elementName: string;
}

export interface ExecutionNode {
  id: string;
  type: NodeType;
  event: string; // raw entry event name (e.g. METHOD_ENTRY)
  name: string;
  timestamp: number; // nanoseconds
  durationNs: number;
  lineNumber: number;

  parentId: string | null;
  children: (ExecutionNode | StatementEvent)[];

  /** Synthetic container that holds top-level code units; not shown as a row. */
  synthetic?: boolean;
  /** Set true if this node was force-closed at EOF (truncated / missing exit). */
  unclosed?: boolean;

  // Rollup metrics (computed post-parse; totals include all descendants).
  /** Wall time minus direct execution-node children (ns). */
  selfNs?: number;
  /** Total SOQL/SOSL executions in this subtree. */
  totSoql?: number;
  /** Total DML operations in this subtree. */
  totDml?: number;
  /** Total DML rows in this subtree. */
  totDmlRows?: number;
  /** Total SOQL/SOSL rows returned in this subtree. */
  totSoqlRows?: number;

  soql?: string;
  soqlRows?: number;
  dmlAction?: string;
  dmlObject?: string;
  dmlRows?: number;
  namespace?: string;
  flowDetails?: FlowNodeDetails;
}

export interface LogException {
  id: string;
  exceptionType: string;
  message: string;
  stackTrace: string[];
  parentNodeId: string | null;
  timestamp: number;
  lineNumber: number;
}

export interface LimitMetric {
  name: string;
  used: number;
  allowed: number;
  percentage: number; // 0..1
}

/** Governor limits keyed by namespace; each namespace is an ordered list. */
export interface GovernorLimits {
  namespaces: Record<string, LimitMetric[]>;
}

export interface LogMetrics {
  totalSoql: number;
  totalSosl: number;
  totalDml: number;
  totalDmlRows: number;
  totalSoqlRows: number;
  totalMethods: number;
  exceptionCount: number;
  /** Max CPU time (ms) taken from limits when APEX_PROFILING is present. */
  cpuTimeMs: number;
  /** Wall-clock duration of the transaction in ms. */
  durationMs: number;
}

export interface ParsedDebugLog {
  id: string;
  header: LogHeader;
  executionTree: ExecutionNode | null;
  exceptions: LogException[];
  governorLimits: GovernorLimits | null;
  metrics: LogMetrics;
  rawLineCount: number;
  truncated: boolean;
  eventLines: LogEventLine[];
}

export interface LogEventLine {
  id: string;
  event: string;
  payload: string;
  lineNumber: number;
  timestampNs: number;
}

export interface LogToken {
  timestampNs: number;
  event: string;
  lineNumber: number;
  payload: string;
}
