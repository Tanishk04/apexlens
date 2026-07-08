import type { LogToken, ParsedDebugLog, LogHeader, ExecutionNode, StatementEvent, NodeType, LogException, LogEventLine } from './types';
import { formatEventLabel, isEntryEvent, isExitEvent, mapEventCategory } from './logDisplay';

/**
 * Stage 1: Stream Scanner
 */
export class StreamScanner {
  private buffer: string = '';

  public *pushChunk(chunk: string): IterableIterator<string> {
    this.buffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIndex).trimEnd();
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

/**
 * Stage 2: Lexer
 */
export class Lexer {
  private lineRegex = /^([0-9:.]+)\s+\((\d+)\)\|([^|]+)(?:\|\[(\d+)\])?(?:\|(.*))?$/;

  public parseHeaderLine(line: string, header: LogHeader): boolean {
    const match = line.match(/^([\d.]+)\s+(.*)$/);
    if (match) {
      header.version = match[1];
      const flagsStr = match[2];
      const flags = flagsStr.split(';');
      for (const flag of flags) {
        const [key, val] = flag.split(',');
        if (key && val) {
          header.traceFlags[key.trim()] = val.trim();
        }
      }
      return true;
    }
    return false;
  }

  public tokenize(line: string): LogToken | null {
    const match = line.match(this.lineRegex);
    if (!match) return null;
    return {
      timestampNs: parseInt(match[2], 10),
      event: match[3],
      lineNumber: match[4] ? parseInt(match[4], 10) : 0,
      payload: match[5] || ''
    };
  }
}

/**
 * Stage 3: Tree Builder
 */
export class TreeBuilder {
  private root: ExecutionNode | null = null;
  private stack: ExecutionNode[] = [];
  private idCounter = 0;
  private exceptions: LogException[] = [];

  private generateId(): string {
    return `node_${++this.idCounter}`;
  }

  public processToken(token: LogToken) {
    if (isEntryEvent(token.event)) {
      const node: ExecutionNode = {
        id: this.generateId(),
        type: this.mapEventType(token.event),
        name: formatEventLabel(token.event, token.payload),
        timestamp: token.timestampNs,
        durationNs: 0,
        lineNumber: token.lineNumber,
        parentId: this.stack.length > 0 ? this.stack[this.stack.length - 1].id : null,
        children: [],
        soql: token.event === 'SOQL_EXECUTE_BEGIN' ? formatEventLabel(token.event, token.payload) : undefined,
      };

      if (this.stack.length > 0) {
        this.stack[this.stack.length - 1].children.push(node);
      } else if (!this.root) {
        this.root = node;
      }

      this.stack.push(node);
      return;
    }

    if (isExitEvent(token.event)) {
      const node = this.stack.pop();
      if (node) {
        node.durationNs = token.timestampNs - node.timestamp;
      }
      return;
    }

    if (token.event === 'EXCEPTION_THROWN' || token.event === 'FATAL_ERROR') {
      const parentId = this.stack.length > 0 ? this.stack[this.stack.length - 1].id : null;
      const exception: LogException = {
        id: this.generateId(),
        exceptionType: token.event,
        message: formatEventLabel(token.event, token.payload),
        stackTrace: [],
        parentNodeId: parentId,
        timestamp: token.timestampNs
      };
      this.exceptions.push(exception);

      const statement: StatementEvent = {
        id: exception.id,
        type: 'EXCEPTION',
        timestamp: token.timestampNs,
        lineNumber: token.lineNumber,
        text: formatEventLabel(token.event, token.payload)
      };
      if (this.stack.length > 0) {
        this.stack[this.stack.length - 1].children.push(statement);
      }
      return;
    }

    if (token.event === 'USER_DEBUG') {
      const statement: StatementEvent = {
        id: this.generateId(),
        type: 'DEBUG',
        timestamp: token.timestampNs,
        lineNumber: token.lineNumber,
        text: formatEventLabel(token.event, token.payload)
      };
      if (this.stack.length > 0) {
        this.stack[this.stack.length - 1].children.push(statement);
      }
    }
  }

  public getResult(): { tree: ExecutionNode | null, exceptions: LogException[] } {
    return { tree: this.root, exceptions: this.exceptions };
  }

  private mapEventType(event: string): NodeType {
    const category = mapEventCategory(event);
    if (category === 'CODE_UNIT') return 'SYSTEM';
    if (category === 'DEBUG' || category === 'EXCEPTION') return 'SYSTEM';
    return category as NodeType;
  }
}

/**
 * Main Parser Class
 */
export class SalesforceLogParser {
  private scanner = new StreamScanner();
  private lexer = new Lexer();
  private builder = new TreeBuilder();
  private header: LogHeader = { version: '', timestamp: '', traceFlags: {} };
  private lineCount = 0;
  private eventLines: LogEventLine[] = [];

  public parseChunk(chunk: string) {
    for (const line of this.scanner.pushChunk(chunk)) {
      this.processLine(line);
    }
  }

  public finish(): ParsedDebugLog {
    const finalLine = this.scanner.finish();
    if (finalLine) {
      this.processLine(finalLine);
    }

    const { tree, exceptions } = this.builder.getResult();

    return {
      id: 'log_' + Date.now(),
      header: this.header,
      executionTree: tree,
      exceptions: exceptions,
      governorLimits: null,
      metrics: { totalSoql: 0, totalDmlRows: 0, totalCpuTimeNs: 0 },
      rawLineCount: this.lineCount,
      truncated: false,
      eventLines: this.eventLines,
    };
  }

  private processLine(line: string) {
    this.lineCount++;
    if (this.lineCount < 20) {
      if (this.lexer.parseHeaderLine(line, this.header)) {
        return;
      }
    }

    const token = this.lexer.tokenize(line);
    if (token) {
      this.eventLines.push({
        id: `line_${this.lineCount}`,
        event: token.event,
        payload: token.payload,
        lineNumber: token.lineNumber,
        timestampNs: token.timestampNs,
      });
      this.builder.processToken(token);
    }
  }
}
