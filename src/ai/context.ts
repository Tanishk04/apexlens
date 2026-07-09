import type { ParsedDebugLog } from '../types';
import type { Analysis } from '../app/utils/analysis';

/**
 * Compact, structured summary of a debug log for an LLM. This is the ONLY thing
 * ever sent to an AI provider — never the raw log. It is deliberately trimmed so
 * even a 20MB log becomes a few kilobytes of JSON.
 */
export interface AiContext {
  summary: {
    durationMs: number;
    soql: number;
    dml: number;
    dmlRows: number;
    methods: number;
    exceptions: number;
    truncated: boolean;
    categories: string[];
  };
  exceptions: {
    type: string;
    message: string;
    lineNumber: number;
    stackTrace: string[];
  }[];
  limits: { namespace: string; name: string; used: number; allowed: number; pct: number }[];
  topMethods: { name: string; type: string; totalMs: number; selfMs: number; count: number }[];
  slowestSoql: { query: string; count: number; totalMs: number; maxRows: number; inLoop: boolean }[];
  soqlInLoopCount: number;
  dml: { action: string; object: string; count: number; totalRows: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildAiContext(log: ParsedDebugLog, analysis: Analysis): AiContext {
  const m = log.metrics;

  const limits: AiContext['limits'] = [];
  if (log.governorLimits) {
    for (const [namespace, list] of Object.entries(log.governorLimits.namespaces)) {
      for (const l of list) {
        // Only carry limits that are actually used — keeps the payload lean.
        if (l.used > 0) {
          limits.push({
            namespace,
            name: l.name,
            used: l.used,
            allowed: l.allowed,
            pct: Math.round(l.percentage * 100),
          });
        }
      }
    }
  }
  limits.sort((a, b) => b.pct - a.pct);

  return {
    summary: {
      durationMs: Math.round(m.durationMs),
      soql: m.totalSoql,
      dml: m.totalDml,
      dmlRows: m.totalDmlRows,
      methods: m.totalMethods,
      exceptions: m.exceptionCount,
      truncated: log.truncated,
      categories: log.header.categories.map((c) => `${c.category}:${c.level}`),
    },
    exceptions: log.exceptions.map((e) => ({
      type: e.exceptionType,
      message: e.message,
      lineNumber: e.lineNumber,
      stackTrace: e.stackTrace.slice(0, 20),
    })),
    limits: limits.slice(0, 12),
    topMethods: analysis.methods.slice(0, 15).map((r) => ({
      name: r.name,
      type: r.type,
      totalMs: round1(r.totalMs),
      selfMs: round1(r.selfMs),
      count: r.count,
    })),
    slowestSoql: analysis.soql.slice(0, 10).map((r) => ({
      query: r.query.slice(0, 300),
      count: r.count,
      totalMs: round1(r.totalMs),
      maxRows: r.maxRows,
      inLoop: r.inLoop,
    })),
    soqlInLoopCount: analysis.soqlInLoopCount,
    dml: analysis.dml.slice(0, 10).map((r) => ({
      action: r.action,
      object: r.object,
      count: r.count,
      totalRows: r.totalRows,
    })),
  };
}

export interface AiPrompt {
  system: string;
  user: string;
}

/** System + user prompt for the summary-only diagnosis request. */
export function buildPrompt(context: AiContext): AiPrompt {
  const system =
    'You are a Salesforce Apex performance and debugging expert. You are given a ' +
    'STRUCTURED summary of a Salesforce debug log (never the raw log). Diagnose the ' +
    'most likely root cause of any failure, call out governor-limit and performance ' +
    'risks (SOQL in loops, slow methods, high DML), and give concrete, prioritized ' +
    'fixes. Be concise and use short markdown sections.';
  const user =
    'Here is the structured debug-log summary as JSON:\n\n```json\n' +
    JSON.stringify(context, null, 2) +
    '\n```\n\nDiagnose what happened and how to fix it.';
  return { system, user };
}

/**
 * Character budget for the raw log inside the prompt (~175k tokens). Longer
 * logs are clipped head+tail — the middle is usually repetitive method noise,
 * while failures/limits live at the edges.
 */
export const FULL_LOG_CHAR_LIMIT = 700_000;
const HEAD_CHARS = 350_000;
const TAIL_CHARS = 100_000;

/**
 * Full-log prompt: structured summary as orientation + the complete raw log.
 * The user opted in to sending the whole log (token cost shown in the UI).
 */
export function buildFullPrompt(rawLog: string, context: AiContext): AiPrompt {
  const system =
    'You are a Salesforce Apex performance and debugging expert. You receive a ' +
    'structured summary of a debug log followed by the raw debug log itself. ' +
    'Read the ENTIRE log, then diagnose: root cause of any failure, governor-limit ' +
    'risks, performance problems (SOQL in loops, recursive triggers, slow methods, ' +
    'high DML), and concrete prioritized fixes referencing specific lines, methods ' +
    'and queries from the log. Be specific — quote the relevant log lines. Use ' +
    'short markdown sections.';

  let logSection: string;
  if (rawLog.length > FULL_LOG_CHAR_LIMIT) {
    const head = rawLog.slice(0, HEAD_CHARS);
    const tail = rawLog.slice(-TAIL_CHARS);
    logSection =
      head +
      `\n\n[… log truncated for context: ${(rawLog.length - HEAD_CHARS - TAIL_CHARS).toLocaleString()} characters omitted …]\n\n` +
      tail;
  } else {
    logSection = rawLog;
  }

  const user =
    'Structured summary (orientation):\n\n```json\n' +
    JSON.stringify(context, null, 2) +
    '\n```\n\nComplete raw debug log:\n\n```\n' +
    logSection +
    '\n```\n\nDiagnose what happened and how to fix it.';
  return { system, user };
}
