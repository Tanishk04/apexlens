import type {
  LogToken,
  ParsedDebugLog,
  LogHeader,
  ExecutionNode,
  StatementEvent,
  LogException,
  LogEventLine,
  LimitMetric,
  GovernorLimits,
  LogMetrics,
} from './types';
import { formatEventLabel } from './logDisplay';
import {
  isEntryEvent,
  isExitEvent,
  isNoiseEvent,
  isBlockEvent,
  isUnrecognizedEvent,
  entryNodeType,
  eventCategory,
  EXIT_TO_ENTRY,
  LIMIT_BLOCK_STARTS,
  BURST_ENTRY_EVENTS,
  groupForEvent,
  groupOpen,
  groupExtend,
  groupClose,
  type EventGroupSpec,
} from './events';

const MAX_CONTINUATION = 5000; // guard against pathological multi-line payloads

/** Stage 1: Stream Scanner — yields complete lines from arbitrary chunks. */
export class StreamScanner {
  private buffer = '';

  public *pushChunk(chunk: string): IterableIterator<string> {
    this.buffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.substring(newlineIndex + 1);
      yield line;
    }
  }

  public finish(): string | null {
    if (this.buffer.length > 0) {
      const finalLine = this.buffer;
      this.buffer = '';
      return finalLine;
    }
    return null;
  }
}

/** Stage 2: Lexer — turns a raw line into a token or null. */
export class Lexer {
  private lineRegex = /^([0-9:.]+)\s+\((\d+)\)\|([A-Z0-9_]+)(?:\|\[(\d+)\])?(?:\|([\s\S]*))?$/;

  public parseHeaderLine(line: string, header: LogHeader): boolean {
    const match = line.match(/^([\d.]+)\s+(.*)$/);
    if (!match) return false;
    header.version = match[1]!;
    const flagsStr = match[2]!;
    for (const flag of flagsStr.split(';')) {
      const [key, val] = flag.split(',');
      if (key && val) {
        const category = key.trim();
        const level = val.trim();
        header.traceFlags[category] = level;
        header.categories.push({ category, level });
      }
    }
    return true;
  }

  public tokenize(line: string): LogToken | null {
    const match = line.match(this.lineRegex);
    if (!match) return null;
    return {
      timestampNs: parseInt(match[2]!, 10),
      event: match[3]!,
      lineNumber: match[4] ? parseInt(match[4], 10) : 0,
      rawLine: 0, // stamped by SalesforceLogParser.processLine with the real raw-log line index
      payload: match[5] ?? '',
    };
  }
}

interface Counters {
  soql: number;
  sosl: number;
  dml: number;
  dmlRows: number;
  soqlRows: number;
  methods: number;
}

/** Stage 3: Tree Builder — stack-based, tolerant of missing exits. */
export class TreeBuilder {
  private root: ExecutionNode;
  private stack: ExecutionNode[];
  private idCounter = 0;
  private exceptions: LogException[] = [];
  private lastStatement: StatementEvent | null = null;
  private lastException: LogException | null = null;
  /** Held row per open `EventGroupSpec.key` (e.g. an open validation rule awaiting its formula and PASS/FAIL). */
  private openGroupRows: Record<string, StatementEvent | null> = {};
  /** Parent to attach the next sibling of an in-progress `BURST_ENTRY_EVENTS` run to (see `events.ts`). */
  private burst: { event: string; parent: ExecutionNode } | null = null;
  /** Which field of `lastStatement` untimestamped lines extend. */
  private continuationField: 'text' | 'detail' = 'text';

  public firstTs = -1;
  public lastTs = 0;
  public counters: Counters = { soql: 0, sosl: 0, dml: 0, dmlRows: 0, soqlRows: 0, methods: 0 };

  constructor() {
    this.root = {
      id: 'root',
      type: 'CODE_UNIT',
      event: 'EXECUTION_STARTED',
      name: 'Execution',
      timestamp: 0,
      durationNs: 0,
      lineNumber: 0,
      rawLine: 0,
      parentId: null,
      children: [],
      synthetic: true,
    };
    this.stack = [this.root];
  }

  private generateId(): string {
    return `n${++this.idCounter}`;
  }

  private top(): ExecutionNode {
    return this.stack[this.stack.length - 1]!;
  }

  public processToken(token: LogToken): void {
    const { event, payload, timestampNs, lineNumber, rawLine } = token;
    if (this.firstTs < 0) this.firstTs = timestampNs;
    this.lastTs = timestampNs;

    if (isEntryEvent(event)) {
      const node = this.createNode(token);
      const top = this.top();
      // See BURST_ENTRY_EVENTS in events.ts: a handful of events fire as a
      // same-name burst (several BEGINs before any END) rather than nesting
      // one inside the next. The signature — top of stack is the same event
      // and hasn't logged any real work yet — is indistinguishable from
      // genuine first-level recursion by shape alone, so it's only applied
      // to events confirmed to actually burst, never generally.
      let parent = top;
      if (BURST_ENTRY_EVENTS.has(event) && top.event === event && top.children.length === 0) {
        parent = this.burst && this.burst.event === event ? this.burst.parent : (this.stack[this.stack.length - 2] ?? top);
        this.burst = { event, parent };
      } else {
        this.burst = null;
      }
      node.parentId = parent.id;
      parent.children.push(node);
      this.stack.push(node);
      this.lastStatement = null;
      if (event === 'SOQL_EXECUTE_BEGIN') this.counters.soql++;
      else if (event === 'SOSL_EXECUTE_BEGIN') this.counters.sosl++;
      else if (event === 'DML_BEGIN') {
        this.counters.dml++;
        this.counters.dmlRows += node.dmlRows ?? 0;
      } else if (event === 'METHOD_ENTRY' || event === 'CONSTRUCTOR_ENTRY') {
        this.counters.methods++;
      }
      return;
    }

    if (isExitEvent(event)) {
      const node = this.closeForExit(event, timestampNs);
      if (node && (event === 'SOQL_EXECUTE_END' || event === 'SOSL_EXECUTE_END')) {
        const rows = this.rowsFrom(payload);
        if (rows != null) {
          node.soqlRows = rows;
          this.counters.soqlRows += rows;
        }
      }
      this.lastStatement = null;
      return;
    }

    if (event === 'EXCEPTION_THROWN' || event === 'FATAL_ERROR') {
      const message = formatEventLabel(event, payload);
      const parent = this.top();
      const exc: LogException = {
        id: this.generateId(),
        exceptionType: this.exceptionType(message, event),
        message,
        stackTrace: [],
        parentNodeId: parent.synthetic ? null : parent.id,
        timestamp: timestampNs,
        lineNumber,
        rawLine,
      };
      this.exceptions.push(exc);
      const stmt: StatementEvent = {
        id: exc.id, // share id so selecting the exception highlights this row
        type: 'EXCEPTION',
        event,
        timestamp: timestampNs,
        lineNumber,
        rawLine,
        text: message,
      };
      parent.children.push(stmt);
      this.lastStatement = stmt;
      this.lastException = exc;
      return;
    }

    if (event === 'USER_DEBUG') {
      this.pushStatement(token, 'DEBUG');
      return;
    }

    const group = groupForEvent(event);
    if (group) {
      this.handleGroup(token, group);
      return;
    }

    if (isNoiseEvent(event) || event === 'EXECUTION_STARTED' || event === 'EXECUTION_FINISHED') {
      // Clear BOTH continuation targets. Leaving lastException set here let a
      // later block body (e.g. a STATIC_VARIABLE_LIST dump) get appended to an
      // unrelated earlier exception's stack trace.
      this.lastStatement = null;
      this.lastException = null;
      return;
    }

    // Unknown / other displayable event → generic statement (never dropped).
    this.pushStatement(token, 'GENERIC');
  }

  /**
   * Close the node an exit event belongs to, and return it.
   *
   * Salesforce logs are well nested, so popping the stack top is right almost
   * always — but not when an event only *looks* like a pair. An unpaired entry
   * left a node the top-pop then consumed on some later, unrelated exit; from
   * that point every duration in the transaction was attributed one level off,
   * and because exits ignored names it never resynced. POINT_EVENTS keeps the
   * known offenders out of the pairing entirely; this adds the second guard.
   *
   * For an exit we can name (EXIT_TO_ENTRY), find the nearest matching open node
   * and force-close anything above it — the same treatment `finalize()` gives
   * nodes left open at EOF. If nothing matches, the exit is spurious: ignore it
   * rather than closing a node it has nothing to do with. Unmapped exit names
   * keep the old top-pop, so future/renamed API events still nest.
   */
  private closeForExit(event: string, timestampNs: number): ExecutionNode | null {
    const expectedEntry = EXIT_TO_ENTRY[event];

    if (expectedEntry !== undefined) {
      let match = -1;
      for (let i = this.stack.length - 1; i >= 1; i--) {
        if (this.stack[i]!.event === expectedEntry) {
          match = i;
          break;
        }
      }
      if (match < 0) return null; // spurious exit — nothing it could close
      while (this.stack.length - 1 > match) {
        const orphan = this.stack.pop()!;
        orphan.unclosed = true;
        orphan.durationNs = Math.max(0, timestampNs - orphan.timestamp);
      }
    }

    if (this.stack.length <= 1) return null;
    const node = this.stack.pop()!;
    // Clamped the same way the orphan/force-close path above already is: a
    // clock jump backwards between a node's entry and its own exit (rare, but
    // real logs do it) must not turn into a negative duration that silently
    // blanks the Total column instead of just reading as (near-)zero.
    node.durationNs = Math.max(0, timestampNs - node.timestamp);
    return node;
  }

  /**
   * Fold a group's events into one row, per its `EventGroupSpec` (see
   * `events.ts`). Originally hand-written just for validation rules —
   * Salesforce reports each rule as VALIDATION_RULE, then VALIDATION_FORMULA,
   * then VALIDATION_PASS/FAIL, so 51 rules became 153 tree rows, two thirds of
   * which carried no name and could not be read on their own. Generalized so
   * the next multi-event burst Salesforce turns out to have is a new
   * `EVENT_GROUPS` entry, not a new method here.
   */
  private handleGroup(token: LogToken, group: EventGroupSpec): void {
    const { event } = token;

    if (groupOpen(event)) {
      this.openGroupRows[group.key] = this.pushStatement(token, group.type);
      return;
    }

    const extend = groupExtend(event);
    if (extend) {
      const row = this.openGroupRows[group.key];
      if (!row) {
        this.pushStatement(token, group.type);
        return;
      }
      row.detail = token.payload;
      // The extended body (e.g. a validation formula) arrives on the
      // untimestamped lines that follow, so aim continuations at that field
      // rather than at the row's name.
      if (extend.continuation) {
        this.lastStatement = row;
        this.continuationField = extend.field;
      }
      return;
    }

    const close = groupClose(event);
    if (close) {
      const row = this.openGroupRows[group.key];
      if (row) {
        row.validationResult = close.value;
        this.openGroupRows[group.key] = null;
        this.lastStatement = null;
        return;
      }
      this.pushStatement(token, group.type).validationResult = close.value;
      return;
    }

    // Family member that's neither opener, extender, nor closer (e.g.
    // VALIDATION_ERROR) stands on its own.
    this.pushStatement(token, group.type);
  }

  /** Append an untimestamped continuation line (multi-line debug or stack trace). */
  public appendContinuation(line: string): void {
    if (this.lastException) {
      const trimmed = line.trim();
      if (trimmed) this.lastException.stackTrace.push(trimmed);
    }
    if (!this.lastStatement) return;

    if (this.continuationField === 'detail') {
      const current = this.lastStatement.detail ?? '';
      if (current.length < MAX_CONTINUATION) this.lastStatement.detail = current + '\n' + line;
      return;
    }
    if (this.lastStatement.text.length < MAX_CONTINUATION) {
      this.lastStatement.text += '\n' + line;
    }
  }

  private pushStatement(token: LogToken, type: StatementEvent['type']): StatementEvent {
    const stmt: StatementEvent = {
      id: this.generateId(),
      type,
      event: token.event,
      timestamp: token.timestampNs,
      lineNumber: token.lineNumber,
      rawLine: token.rawLine,
      text: formatEventLabel(token.event, token.payload),
    };
    // Statements carry the category the registry already knows, rather than
    // inheriting the coarse StatementType. Without this, everything reaching the
    // GENERIC fallthrough rendered as an unknown grey row — including events we
    // classify perfectly well, e.g. SOQL_EXECUTE_EXPLAIN, which is SOQL.
    const category = eventCategory(token.event);
    if (category !== 'GENERIC') stmt.category = category;
    this.top().children.push(stmt);
    this.lastStatement = stmt;
    this.lastException = null;
    this.continuationField = 'text';
    return stmt;
  }

  private createNode(token: LogToken): ExecutionNode {
    const { event, payload, timestampNs, lineNumber, rawLine } = token;
    const node: ExecutionNode = {
      id: this.generateId(),
      type: entryNodeType(event),
      event,
      name: formatEventLabel(event, payload),
      timestamp: timestampNs,
      durationNs: 0,
      lineNumber,
      rawLine,
      parentId: this.top().id,
      children: [],
    };

    if (event === 'CODE_UNIT_STARTED') {
      const low = payload.toLowerCase();
      if (low.includes('trigger')) node.type = 'TRIGGER';
      else if (low.includes('workflow')) node.type = 'WORKFLOW';
      else if (low.includes('flow')) node.type = 'FLOW';
    } else if (event === 'SOQL_EXECUTE_BEGIN' || event === 'SOSL_EXECUTE_BEGIN') {
      node.soql = node.name;
    } else if (event === 'DML_BEGIN') {
      const parts = payload.split('|');
      const op = this.field(parts, 'Op:');
      const type = this.field(parts, 'Type:');
      const rows = this.field(parts, 'Rows:');
      if (op) node.dmlAction = op;
      if (type) node.dmlObject = type;
      if (rows) node.dmlRows = parseInt(rows, 10);
    } else if (event === 'FLOW_ELEMENT_BEGIN' || event === 'FLOW_BULK_ELEMENT_BEGIN') {
      const parts = payload.split('|').filter(Boolean);
      // Inherit the enclosing flow's name from whatever this element nests
      // under: the interview itself (whose own flowDetails.flowName is blank,
      // so this falls back to its .name — the interview's name), or, for an
      // element nested inside another element, that element's already-
      // inherited flowName. Previously hardcoded to '', so Flow Analysis could
      // never say which flow an element belonged to.
      const parent = this.top();
      const flowName = parent.flowDetails?.flowName || parent.name;
      node.flowDetails = {
        flowName,
        elementType: parts[parts.length - 2] ?? '',
        elementName: parts[parts.length - 1] ?? '',
      };
    } else if (event === 'FLOW_START_INTERVIEW_BEGIN' || event === 'FLOW_CREATE_INTERVIEW_BEGIN') {
      // flowName intentionally blank: this node IS the flow, so attributing it
      // to itself just duplicated the same string into both the Flow and
      // Element columns of the Flow Analysis table.
      node.flowDetails = { flowName: '', elementType: 'Interview', elementName: node.name };
    }

    return node;
  }

  private field(parts: string[], prefix: string): string | undefined {
    const p = parts.find((x) => x.startsWith(prefix));
    return p ? p.slice(prefix.length) : undefined;
  }

  private rowsFrom(payload: string): number | null {
    const m = payload.match(/Rows:(\d+)/);
    return m ? parseInt(m[1]!, 10) : null;
  }

  private exceptionType(message: string, event: string): string {
    const m = message.match(/([\w.]+(?:Exception|Error))/);
    return m ? m[1]! : event;
  }

  /** Close any nodes left open at EOF (truncated logs / missing exits). */
  public finalize(): void {
    while (this.stack.length > 1) {
      const node = this.stack.pop()!;
      node.unclosed = true;
      node.durationNs = Math.max(0, this.lastTs - node.timestamp);
    }
    this.root.timestamp = this.firstTs < 0 ? 0 : this.firstTs;
    this.root.durationNs = this.firstTs < 0 ? 0 : this.lastTs - this.firstTs;
    this.rollup(this.root);
  }

  /**
   * Post-order rollup of per-node metrics: self time (total minus direct
   * execution-node children) and subtree totals for SOQL/DML counts and rows.
   */
  private rollup(node: ExecutionNode): void {
    let childTotalNs = 0;
    let soql = 0;
    let dml = 0;
    let dmlRows = 0;
    let soqlRows = 0;

    if (node.type === 'SOQL' || node.type === 'SOSL') {
      soql = 1;
      soqlRows = node.soqlRows ?? 0;
    } else if (node.type === 'DML') {
      dml = 1;
      dmlRows = node.dmlRows ?? 0;
    }

    for (const child of node.children) {
      if (!('children' in child)) continue;
      this.rollup(child);
      childTotalNs += child.durationNs;
      soql += child.totSoql ?? 0;
      dml += child.totDml ?? 0;
      dmlRows += child.totDmlRows ?? 0;
      soqlRows += child.totSoqlRows ?? 0;
    }

    node.selfNs = Math.max(0, node.durationNs - childTotalNs);
    node.totSoql = soql;
    node.totDml = dml;
    node.totDmlRows = dmlRows;
    node.totSoqlRows = soqlRows;
  }

  public getRoot(): ExecutionNode {
    return this.root;
  }

  public getExceptions(): LogException[] {
    return this.exceptions;
  }
}

/**
 * State for the multi-line blocks Salesforce emits — an event line followed by
 * untimestamped body lines. `limits` bodies become governor metrics; `skip`
 * bodies (variable dumps) are discarded. Outside a block, an untimestamped line
 * is a genuine continuation of the previous statement.
 */
type BlockState = { kind: 'limits'; ns: string } | { kind: 'skip' } | null;

/** Main streaming parser. */
export class SalesforceLogParser {
  private scanner = new StreamScanner();
  private lexer = new Lexer();
  private builder = new TreeBuilder();
  private header: LogHeader = { version: '', timestamp: '', traceFlags: {}, categories: [] };
  private headerParsed = false;
  private lineCount = 0;
  private truncated = false;
  private eventLines: LogEventLine[] = [];
  /** Most recent event line, so its untimestamped continuation can be attached. */
  private lastEventLine: LogEventLine | null = null;
  /** Events the registry could not recognise at all, with occurrence counts. */
  private unrecognized: Record<string, number> = {};

  // Governor-limit / multi-line block state.
  private limits: Record<string, LimitMetric[]> = {};
  private currentBlock: BlockState = null;

  public parseChunk(chunk: string): void {
    for (const line of this.scanner.pushChunk(chunk)) {
      this.processLine(line);
    }
  }

  public finish(): ParsedDebugLog {
    const finalLine = this.scanner.finish();
    if (finalLine !== null) this.processLine(finalLine);

    this.builder.finalize();

    const namespaces = Object.keys(this.limits);
    const governorLimits: GovernorLimits | null =
      namespaces.length > 0 ? { namespaces: this.limits } : null;

    const metrics = this.buildMetrics(governorLimits);

    const result: ParsedDebugLog = {
      id: 'log_' + Date.now(),
      header: this.header,
      executionTree: this.builder.getRoot(),
      exceptions: this.builder.getExceptions(),
      governorLimits,
      metrics,
      rawLineCount: this.lineCount,
      truncated: this.truncated,
      eventLines: this.eventLines,
    };
    if (Object.keys(this.unrecognized).length > 0) {
      result.unrecognizedEvents = this.unrecognized;
    }
    return result;
  }

  private processLine(line: string): void {
    this.lineCount++;

    if (line.includes('MAXIMUM DEBUG LOG SIZE REACHED')) {
      this.truncated = true;
      return;
    }

    if (!this.headerParsed && this.lexer.parseHeaderLine(line, this.header)) {
      this.headerParsed = true;
      return;
    }

    const token = this.lexer.tokenize(line);

    if (!token) {
      // Untimestamped line. Inside a block it belongs to the block: parse it as a
      // limit row, or drop it. Only outside a block is it a real continuation of
      // the previous statement.
      if (this.currentBlock !== null) {
        if (this.currentBlock.kind === 'limits') this.tryLimitLine(line);
        return;
      }
      this.builder.appendContinuation(line);
      this.appendEventContinuation(line);
      return;
    }

    token.rawLine = this.lineCount;

    const eventLine: LogEventLine = {
      id: `l${this.lineCount}`,
      event: token.event,
      payload: token.payload,
      lineNumber: token.lineNumber,
      timestampNs: token.timestampNs,
    };
    this.eventLines.push(eventLine);
    this.lastEventLine = eventLine;

    if (isUnrecognizedEvent(token.event)) {
      this.unrecognized[token.event] = (this.unrecognized[token.event] ?? 0) + 1;
    }

    // Governor-limit block handling (multi-line; body follows on plain lines).
    if (token.event === 'LIMIT_USAGE_FOR_NS') {
      const ns = this.extractNs(token.payload);
      this.currentBlock = { kind: 'limits', ns };
      if (!this.limits[ns]) this.limits[ns] = [];
      return;
    }
    if (LIMIT_BLOCK_STARTS.has(token.event)) {
      // CUMULATIVE_LIMIT_USAGE / TESTING_LIMITS just bracket NS blocks.
      return;
    }
    if (
      token.event === 'CUMULATIVE_LIMIT_USAGE_END' ||
      token.event === 'CUMULATIVE_PROFILING_END' ||
      token.event === 'CUMULATIVE_PROFILING' ||
      token.event === 'CUMULATIVE_PROFILING_BEGIN'
    ) {
      this.currentBlock = null;
      return;
    }
    // Profiling dumps (STATIC_VARIABLE_LIST, STACK_FRAME_VARIABLE_LIST): open a
    // skip block so the body is discarded. processToken still runs so the noise
    // path clears the continuation targets.
    if (isBlockEvent(token.event)) {
      this.currentBlock = { kind: 'skip' };
      this.builder.processToken(token);
      return;
    }

    // Any other real event ends the current block.
    this.currentBlock = null;
    this.builder.processToken(token);
  }

  /**
   * Attach an untimestamped line to the event that owns it. Bounded by the same
   * MAX_CONTINUATION budget the tree uses, so a pathological single-line payload
   * can't grow this without limit.
   */
  private appendEventContinuation(line: string): void {
    const target = this.lastEventLine;
    if (!target) return;
    const existing = target.continuation;
    if (existing === undefined) {
      target.continuation = line;
    } else if (existing.length < MAX_CONTINUATION) {
      target.continuation = existing + '\n' + line;
    }
  }

  /**
   * Record one "Name: used out of allowed" line from a governor-limit block.
   *
   * Salesforce writes a full CUMULATIVE_LIMIT_USAGE snapshot per code unit —
   * this reference log has 17 for the default namespace alone — so the same 13
   * metric names recur repeatedly (17 x 13 = 221 rows for 13 real metrics).
   * The values are cumulative and non-decreasing across those snapshots (traced
   * end to end: SOQL queries 0,0,0,0,10,…,30; CPU time 0,190,…,1224), so rather
   * than collecting every snapshot this keeps one entry per name, updated to the
   * higher figure whenever a later block reports one. If a future log ever
   * reports a lower figure it is highest-so-far, not "final" — the safer of the
   * two given the values observed always climb.
   */
  private tryLimitLine(line: string): boolean {
    const m = line.match(/^\s*(.+?):\s*([\d,]+)\s+out of\s+([\d,]+)/);
    if (!m || this.currentBlock?.kind !== 'limits') return false;
    const used = parseInt(m[2]!.replace(/,/g, ''), 10);
    const allowed = parseInt(m[3]!.replace(/,/g, ''), 10);
    const name = m[1]!.trim();

    const list = this.limits[this.currentBlock.ns]!;
    const existing = list.find((l) => l.name === name);
    if (existing) {
      if (used > existing.used) {
        existing.used = used;
        existing.allowed = allowed;
        existing.percentage = allowed > 0 ? used / allowed : 0;
      }
    } else {
      list.push({ name, used, allowed, percentage: allowed > 0 ? used / allowed : 0 });
    }
    return true;
  }

  private extractNs(payload: string): string {
    const m = payload.match(/\(([^)]*)\)/);
    return m ? m[1]! || 'default' : 'default';
  }

  private buildMetrics(limits: GovernorLimits | null): LogMetrics {
    const c = this.builder.counters;
    let cpuTimeMs = 0;
    if (limits) {
      const def = limits.namespaces['default'] ?? Object.values(limits.namespaces)[0] ?? [];
      const cpu = def.find((l) => /CPU/i.test(l.name));
      if (cpu) cpuTimeMs = cpu.used;
    }
    const durationMs =
      this.builder.firstTs >= 0 ? (this.builder.lastTs - this.builder.firstTs) / 1_000_000 : 0;
    return {
      totalSoql: c.soql,
      totalSosl: c.sosl,
      totalDml: c.dml,
      totalDmlRows: c.dmlRows,
      totalSoqlRows: c.soqlRows,
      totalMethods: c.methods,
      exceptionCount: this.builder.getExceptions().length,
      cpuTimeMs,
      durationMs,
    };
  }
}
