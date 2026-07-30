import type { ExecutionNode, StatementEvent, LogEventLine } from '../../types';
import { formatEventLabel, mapEventCategory, shouldDisplayEvent } from '../../logDisplay';

export interface FlatTreeNode {
  id: string;
  depth: number;
  type: string;
  name: string;
  durationMs: number;
  lineNumber?: number;
  /** 1-based raw debug log line index (for jump-to-log-line); absent for flattened event lines. */
  rawLine?: number;
  event?: string;
  /** True when this row is an ExecutionNode that has visible children. */
  expandable: boolean;
  /** True when currently collapsed (children hidden). */
  collapsed: boolean;
  // Rollup metrics (subtree totals; 0 = hide in UI).
  selfMs: number;
  totSoql: number;
  totDml: number;
  totRows: number;
  /**
   * PASS/FAIL for a validation-rule row, shown inline. Previously only reachable
   * by opening the detail panel, which does not scale — a log with 51 rules
   * meant 51 clicks to see which failed.
   */
  validationResult?: 'PASS' | 'FAIL';
}

interface FlattenOptions {
  showDebug?: boolean;
  /** Set of collapsed node ids; their descendants are hidden. */
  collapsed?: Set<string>;
  /** Optional set of node types to include (undefined = all). */
  types?: Set<string>;
  /** Optional case-insensitive text filter on the row name. */
  search?: string;
}

function isExecutionNode(node: ExecutionNode | StatementEvent): node is ExecutionNode {
  return 'children' in node;
}

function statementVisible(node: StatementEvent, options: FlattenOptions): boolean {
  if (node.type === 'DEBUG') return Boolean(options.showDebug);
  if (node.type === 'ASSIGNMENT' || node.type === 'STATEMENT') return false;
  return true; // EXCEPTION, VALIDATION, GENERIC
}

function durationMs(node: ExecutionNode): number {
  return Math.round(node.durationNs / 1_000_000);
}

export function flattenExecutionTree(
  root: ExecutionNode | null,
  options: FlattenOptions = {},
): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];
  const collapsed = options.collapsed ?? new Set<string>();
  const typeFilter = options.types;
  const search = options.search?.trim().toLowerCase();

  function matches(type: string, name: string): boolean {
    if (typeFilter && !typeFilter.has(type)) return false;
    if (search && !name.toLowerCase().includes(search)) return false;
    return true;
  }

  function walk(node: ExecutionNode | StatementEvent, depth: number) {
    if (isExecutionNode(node)) {
      if (node.synthetic) {
        for (const child of node.children) walk(child, depth);
        return;
      }

      const isCollapsed = collapsed.has(node.id);
      const hasVisibleChildren = node.children.some((c) =>
        isExecutionNode(c) ? true : statementVisible(c, options),
      );

      if (matches(node.type, node.name)) {
        result.push({
          id: node.id,
          depth,
          type: node.type,
          name: node.soql || node.name,
          durationMs: durationMs(node),
          lineNumber: node.lineNumber,
          rawLine: node.rawLine,
          event: node.event,
          expandable: hasVisibleChildren,
          collapsed: isCollapsed,
          selfMs: Math.round((node.selfNs ?? 0) / 1_000_000),
          totSoql: node.totSoql ?? 0,
          totDml: node.totDml ?? 0,
          totRows: (node.totDmlRows ?? 0) + (node.totSoqlRows ?? 0),
        });
      }

      if (!isCollapsed) {
        for (const child of node.children) walk(child, depth + 1);
      }
      return;
    }

    if (!statementVisible(node, options)) return;
    // Filter and colour by the statement's real category when the parser knew
    // one (e.g. SOQL for SOQL_EXECUTE_EXPLAIN); `type` remains the visibility key.
    const displayType = node.category ?? node.type;
    if (!matches(displayType, node.text)) return;
    result.push({
      id: node.id,
      depth,
      type: displayType,
      name: node.text,
      durationMs: 0,
      lineNumber: node.lineNumber,
      rawLine: node.rawLine,
      event: node.event,
      expandable: false,
      collapsed: false,
      selfMs: 0,
      totSoql: 0,
      totDml: 0,
      totRows: 0,
      ...(node.validationResult ? { validationResult: node.validationResult } : {}),
    });
  }

  if (root) walk(root, 0);
  return result;
}

/** Build an id -> node index over the whole tree (nodes and statements). */
export function indexTree(root: ExecutionNode | null): Map<string, ExecutionNode | StatementEvent> {
  const map = new Map<string, ExecutionNode | StatementEvent>();
  function walk(node: ExecutionNode | StatementEvent) {
    map.set(node.id, node);
    if (isExecutionNode(node)) for (const child of node.children) walk(child);
  }
  if (root) walk(root);
  return map;
}

/** Map every node/statement id to its parent execution-node id (or null). */
export function buildParentMap(root: ExecutionNode | null): Map<string, string | null> {
  const map = new Map<string, string | null>();
  function walk(node: ExecutionNode | StatementEvent, parentId: string | null) {
    map.set(node.id, parentId);
    if (isExecutionNode(node)) for (const child of node.children) walk(child, node.id);
  }
  if (root) walk(root, null);
  return map;
}

/**
 * Ancestor execution-node ids from a node up to the root (nearest first),
 * excluding the node itself and the synthetic root. Used to expand the path to
 * a node so it becomes visible (error-first navigation).
 */
export function ancestorIds(
  id: string,
  parents: Map<string, string | null>,
  index: Map<string, ExecutionNode | StatementEvent>,
): string[] {
  const result: string[] = [];
  let current = parents.get(id) ?? null;
  while (current) {
    const node = index.get(current);
    if (node && 'children' in node && !node.synthetic) result.push(current);
    current = parents.get(current) ?? null;
  }
  return result;
}

/** Ids of all non-synthetic execution nodes that have children (collapsible). */
export function collectExpandableIds(root: ExecutionNode | null): string[] {
  const ids: string[] = [];
  function walk(node: ExecutionNode | StatementEvent) {
    if (!isExecutionNode(node)) return;
    if (!node.synthetic && node.children.length > 0) ids.push(node.id);
    for (const child of node.children) walk(child);
  }
  if (root) walk(root);
  return ids;
}

export function flattenEventLines(
  eventLines: LogEventLine[],
  options: FlattenOptions = {},
): FlatTreeNode[] {
  const typeFilter = options.types;
  const search = options.search?.trim().toLowerCase();
  return eventLines
    .filter((line) => shouldDisplayEvent(line.event, options.showDebug))
    .map((line) => ({
      id: line.id,
      depth: 0,
      type: mapEventCategory(line.event),
      name: formatEventLabel(line.event, line.payload),
      durationMs: 0,
      lineNumber: line.lineNumber,
      event: line.event,
      expandable: false,
      collapsed: false,
      selfMs: 0,
      totSoql: 0,
      totDml: 0,
      totRows: 0,
    }))
    .filter(
      (row) =>
        (!typeFilter || typeFilter.has(row.type)) &&
        (!search || row.name.toLowerCase().includes(search)),
    );
}
