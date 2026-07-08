import type { ExecutionNode, StatementEvent, LogEventLine } from '../../types';
import { formatEventLabel, mapEventCategory, shouldDisplayEvent } from '../../logDisplay';

export interface FlatTreeNode {
  id: string;
  depth: number;
  type: string;
  name: string;
  durationMs: number;
  lineNumber?: number;
  event?: string;
  /** True when this row is an ExecutionNode that has visible children. */
  expandable: boolean;
  /** True when currently collapsed (children hidden). */
  collapsed: boolean;
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
          event: node.event,
          expandable: hasVisibleChildren,
          collapsed: isCollapsed,
        });
      }

      if (!isCollapsed) {
        for (const child of node.children) walk(child, depth + 1);
      }
      return;
    }

    if (!statementVisible(node, options)) return;
    if (!matches(node.type, node.text)) return;
    result.push({
      id: node.id,
      depth,
      type: node.type,
      name: node.text,
      durationMs: 0,
      lineNumber: node.lineNumber,
      event: node.event,
      expandable: false,
      collapsed: false,
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
    }))
    .filter(
      (row) =>
        (!typeFilter || typeFilter.has(row.type)) &&
        (!search || row.name.toLowerCase().includes(search)),
    );
}
