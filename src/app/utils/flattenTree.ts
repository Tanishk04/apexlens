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
}

interface FlattenOptions {
  showDebug?: boolean;
}

function isExecutionNode(node: ExecutionNode | StatementEvent): node is ExecutionNode {
  return 'children' in node;
}

function shouldDisplayNode(
  node: ExecutionNode | StatementEvent,
  options: FlattenOptions,
): boolean {
  if (isExecutionNode(node)) return true;
  if (node.type === 'EXCEPTION') return true;
  if (node.type === 'DEBUG') return Boolean(options.showDebug);
  return false;
}

function displayType(node: ExecutionNode): string {
  if (node.soql) return 'SOQL';
  if (node.type === 'METHOD') return 'METHOD';
  if (node.type === 'SYSTEM') return 'CODE_UNIT';
  return node.type;
}

export function flattenExecutionTree(
  root: ExecutionNode | null,
  options: FlattenOptions = {},
): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];

  function walk(node: ExecutionNode | StatementEvent, depth: number) {
    if (!shouldDisplayNode(node, options)) return;

    if (isExecutionNode(node)) {
      result.push({
        id: node.id,
        depth,
        type: displayType(node),
        name: node.soql || node.name,
        durationMs: Math.round(node.durationNs / 1_000_000),
        lineNumber: node.lineNumber,
      });

      for (const child of node.children) {
        walk(child, depth + 1);
      }
      return;
    }

    result.push({
      id: node.id,
      depth,
      type: node.type,
      name: node.text,
      durationMs: 0,
      lineNumber: node.lineNumber,
      event: node.type,
    });
  }

  if (root) {
    walk(root, 0);
  }

  return result;
}

export function flattenEventLines(
  eventLines: LogEventLine[],
  options: FlattenOptions = {},
): FlatTreeNode[] {
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
    }));
}
