import type { ExecutionNode, StatementEvent } from '../../types';
import { eventColorFor } from '../theme/eventColors';

/** A single rectangle in the flame chart (one execution node). */
export interface FlameRect {
  id: string;
  depth: number;
  /** Absolute start timestamp (ns). */
  start: number;
  /** Absolute end timestamp (ns). */
  end: number;
  type: string;
  name: string;
  unclosed: boolean;
  lineNumber: number;
}

/** A point-in-time marker (exception / fatal error) drawn across the chart. */
export interface FlameMarker {
  id: string;
  timestamp: number;
  message: string;
}

export interface FlameLayout {
  rects: FlameRect[];
  markers: FlameMarker[];
  /** Earliest timestamp (ns). */
  t0: number;
  /** Latest timestamp (ns). */
  t1: number;
  /** Deepest row index (0-based). */
  maxDepth: number;
}

function isExecutionNode(n: ExecutionNode | StatementEvent): n is ExecutionNode {
  return 'children' in n;
}

/**
 * Flatten the execution tree into flame-chart rectangles. Depth maps to a row,
 * the node's timestamp/exitStamp map to x-extent. Statement events become
 * point markers (exceptions) rather than rectangles.
 */
export function buildFlameLayout(root: ExecutionNode | null): FlameLayout {
  const rects: FlameRect[] = [];
  const markers: FlameMarker[] = [];
  let t0 = Infinity;
  let t1 = -Infinity;
  let maxDepth = 0;

  function walk(node: ExecutionNode | StatementEvent, depth: number): void {
    if (isExecutionNode(node)) {
      if (node.synthetic) {
        for (const child of node.children) walk(child, depth);
        return;
      }
      const start = node.timestamp;
      const end = node.timestamp + Math.max(0, node.durationNs);
      if (start < t0) t0 = start;
      if (end > t1) t1 = end;
      if (depth > maxDepth) maxDepth = depth;

      rects.push({
        id: node.id,
        depth,
        start,
        end,
        type: node.type,
        name: node.name,
        unclosed: Boolean(node.unclosed),
        lineNumber: node.lineNumber,
      });

      for (const child of node.children) walk(child, depth + 1);
      return;
    }

    if (node.type === 'EXCEPTION') {
      if (node.timestamp < t0) t0 = node.timestamp;
      if (node.timestamp > t1) t1 = node.timestamp;
      markers.push({ id: node.id, timestamp: node.timestamp, message: node.text });
    }
  }

  if (root) walk(root, 0);

  if (!isFinite(t0)) {
    t0 = 0;
    t1 = 0;
  }

  return { rects, markers, t0, t1, maxDepth };
}

/**
 * Clamp a viewport's left edge so it can't pan past the log's actual extent.
 * If the viewport is as wide as (or wider than) the full log span, pin to
 * `t0` — matches the left-aligned convention used when fitting/resetting.
 */
export function clampStartNs(
  startNs: number,
  nsPerPx: number,
  t0: number,
  t1: number,
  widthPx: number,
): number {
  const span = Math.max(1, t1 - t0);
  const viewSpan = nsPerPx * Math.max(0, widthPx);
  if (viewSpan >= span) return t0;
  const maxStart = t1 - viewSpan;
  return Math.min(Math.max(startNs, t0), maxStart);
}

export function flameColor(type: string): string {
  const varName = eventColorFor(type).cssVar;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
}
