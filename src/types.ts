export type NodeType = 
  | 'METHOD' 
  | 'TRIGGER' 
  | 'FLOW' 
  | 'SOQL' 
  | 'DML' 
  | 'CALLOUT' 
  | 'VALIDATION' 
  | 'WORKFLOW' 
  | 'SYSTEM';

export interface LogHeader {
  version: string;
  timestamp: string;
  traceFlags: Record<string, string>;
}

export interface StatementEvent {
  id: string;
  type: 'DEBUG' | 'ASSIGNMENT' | 'STATEMENT' | 'EXCEPTION';
  timestamp: number;
  lineNumber: number;
  text: string;
}

export interface FlowNodeDetails {
  flowName: string;
  elementType: string;
  elementName: string;
}

export interface ExecutionNode {
  id: string;
  type: NodeType;
  name: string;
  timestamp: number; // nanoseconds
  durationNs: number;
  lineNumber: number;
  
  parentId: string | null;
  children: (ExecutionNode | StatementEvent)[];
  
  soql?: string;
  dmlAction?: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT' | 'MERGE';
  dmlRows?: number;
  flowDetails?: FlowNodeDetails;
}

export interface LogException {
  id: string;
  exceptionType: string;
  message: string;
  stackTrace: string[];
  parentNodeId: string | null;
  timestamp: number;
}

export interface LimitMetric {
  used: number;
  allowed: number;
  percentage: number;
}

export interface LimitSnapshot {
  soql: LimitMetric;
  dmlRows: LimitMetric;
  dmlStatements: LimitMetric;
  cpuTime: LimitMetric;
  heapSize: LimitMetric;
  callouts: LimitMetric;
  emailInvocations: LimitMetric;
  futureCalls: LimitMetric;
  queueableCalls: LimitMetric;
}

export interface GovernorLimits {
  namespaces: Record<string, LimitSnapshot>;
}

export interface LogMetrics {
  totalSoql: number;
  totalDmlRows: number;
  totalCpuTimeNs: number;
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
