import type { ExecutionNode, StatementEvent } from '../../types';

/** One aggregated SOQL/SOSL query group. */
export interface SoqlRow {
  query: string;
  count: number;
  totalMs: number;
  totalRows: number;
  maxRows: number;
  lineNumber: number;
  /** Executed more than once at the same source line — likely a query in a loop. */
  inLoop: boolean;
}

/** One aggregated DML group (by operation + object). */
export interface DmlRow {
  action: string;
  object: string;
  count: number;
  totalMs: number;
  totalRows: number;
}

/** One aggregated Flow element / interview group. */
export interface FlowRow {
  flow: string;
  element: string;
  count: number;
  totalMs: number;
}

/** One aggregated execution group (method / trigger / code unit / …). */
export interface MethodRow {
  name: string;
  type: string;
  namespace: string;
  count: number;
  totalMs: number;
  selfMs: number;
}

export interface Analysis {
  soql: SoqlRow[];
  dml: DmlRow[];
  flow: FlowRow[];
  methods: MethodRow[];
  /** Number of query groups flagged as executed in a loop. */
  soqlInLoopCount: number;
}

const NS = 1_000_000;

function isExecutionNode(n: ExecutionNode | StatementEvent): n is ExecutionNode {
  return 'children' in n;
}

/**
 * Single-pass aggregation over the execution tree, producing the SOQL / DML /
 * Flow / Execution summaries shown on the Analysis tab. Self time is computed as
 * total node duration minus the total duration of its direct execution-node
 * children (statements carry no duration).
 */
export function analyze(root: ExecutionNode | null): Analysis {
  const soql = new Map<string, SoqlRow>();
  const dml = new Map<string, DmlRow>();
  const flow = new Map<string, FlowRow>();
  const methods = new Map<string, MethodRow>();
  // Track query executions per source line to detect SOQL-in-loop.
  const soqlLineCounts = new Map<number, number>();

  function walk(node: ExecutionNode | StatementEvent): void {
    if (!isExecutionNode(node)) return;

    if (!node.synthetic) {
      const totalMs = node.durationNs / NS;
      let childTotalNs = 0;
      for (const child of node.children) {
        if (isExecutionNode(child)) childTotalNs += child.durationNs;
      }
      const selfMs = Math.max(0, (node.durationNs - childTotalNs) / NS);

      switch (node.type) {
        case 'SOQL':
        case 'SOSL': {
          const query = node.soql || node.name;
          const rows = node.soqlRows ?? 0;
          const existing = soql.get(query);
          if (existing) {
            existing.count++;
            existing.totalMs += totalMs;
            existing.totalRows += rows;
            existing.maxRows = Math.max(existing.maxRows, rows);
          } else {
            soql.set(query, {
              query,
              count: 1,
              totalMs,
              totalRows: rows,
              maxRows: rows,
              lineNumber: node.lineNumber,
              inLoop: false,
            });
          }
          if (node.lineNumber) {
            soqlLineCounts.set(node.lineNumber, (soqlLineCounts.get(node.lineNumber) ?? 0) + 1);
          }
          break;
        }
        case 'DML': {
          const action = node.dmlAction || 'DML';
          const object = node.dmlObject || '';
          const key = action + '|' + object;
          const rows = node.dmlRows ?? 0;
          const existing = dml.get(key);
          if (existing) {
            existing.count++;
            existing.totalMs += totalMs;
            existing.totalRows += rows;
          } else {
            dml.set(key, { action, object, count: 1, totalMs, totalRows: rows });
          }
          break;
        }
        case 'FLOW': {
          const element = node.flowDetails?.elementName || node.name;
          const flowName = node.flowDetails?.flowName || '';
          const key = flowName + '|' + element;
          const existing = flow.get(key);
          if (existing) {
            existing.count++;
            existing.totalMs += totalMs;
          } else {
            flow.set(key, { flow: flowName, element, count: 1, totalMs });
          }
          break;
        }
      }

      // Every real execution node contributes to the execution summary.
      const mkey = node.type + '|' + (node.namespace ?? '') + '|' + node.name;
      const m = methods.get(mkey);
      if (m) {
        m.count++;
        m.totalMs += totalMs;
        m.selfMs += selfMs;
      } else {
        methods.set(mkey, {
          name: node.name,
          type: node.type,
          namespace: node.namespace ?? '',
          count: 1,
          totalMs,
          selfMs,
        });
      }
    }

    for (const child of node.children) walk(child);
  }

  if (root) walk(root);

  // Flag SOQL groups whose source line ran more than once.
  let soqlInLoopCount = 0;
  for (const row of soql.values()) {
    if (row.lineNumber && (soqlLineCounts.get(row.lineNumber) ?? 0) > 1) {
      row.inLoop = true;
      soqlInLoopCount++;
    }
  }

  return {
    soql: [...soql.values()].sort((a, b) => b.totalMs - a.totalMs),
    dml: [...dml.values()].sort((a, b) => b.totalMs - a.totalMs),
    flow: [...flow.values()].sort((a, b) => b.count - a.count),
    methods: [...methods.values()].sort((a, b) => b.selfMs - a.selfMs),
    soqlInLoopCount,
  };
}
