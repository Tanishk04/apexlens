import { SalesforceLogParser } from '../parser';
import type { ExecutionNode, StatementEvent } from '../types';

function parse(log: string) {
  const parser = new SalesforceLogParser();
  parser.parseChunk(log);
  return parser.finish();
}

function children(node: ExecutionNode): (ExecutionNode | StatementEvent)[] {
  return node.children;
}

function isNode(n: ExecutionNode | StatementEvent): n is ExecutionNode {
  return 'children' in n;
}

describe('SalesforceLogParser — header & basic tree', () => {
  const log = `61.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO
14:22:33.0 (1000000)|EXECUTION_STARTED
14:22:33.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000000|MyClass
14:22:33.0 (3000000)|METHOD_ENTRY|[1]|01p000000000000|MyClass.myMethod()
14:22:33.0 (4000000)|USER_DEBUG|[2]|DEBUG|Hello World
14:22:33.0 (5000000)|METHOD_EXIT|[3]|01p000000000000|MyClass.myMethod()
14:22:33.0 (6000000)|CODE_UNIT_FINISHED|MyClass
14:22:33.0 (7000000)|EXECUTION_FINISHED`;

  it('parses the header trace-flag config', () => {
    const r = parse(log);
    expect(r.header.version).toBe('61.0');
    expect(r.header.categories).toEqual([
      { category: 'APEX_CODE', level: 'DEBUG' },
      { category: 'APEX_PROFILING', level: 'INFO' },
    ]);
  });

  it('builds a synthetic root holding the code unit', () => {
    const r = parse(log);
    const root = r.executionTree!;
    expect(root.synthetic).toBe(true);
    expect(root.children.length).toBe(1);

    const codeUnit = root.children[0] as ExecutionNode;
    expect(codeUnit.type).toBe('CODE_UNIT');
    expect(codeUnit.name).toBe('MyClass');

    const method = children(codeUnit).find((c) => isNode(c) && c.type === 'METHOD') as ExecutionNode;
    expect(method).toBeDefined();
    expect(method.name).toBe('MyClass.myMethod()');
    expect(method.durationNs).toBe(2000000); // 5,000,000 - 3,000,000
    expect(method.children.some((c) => c.type === 'DEBUG')).toBe(true);
  });

  it('counts lines and events, and aggregates method metrics', () => {
    const r = parse(log);
    expect(r.rawLineCount).toBe(8);
    expect(r.eventLines.length).toBe(7);
    expect(r.metrics.totalMethods).toBe(1);
  });
});

describe('SalesforceLogParser — exceptions', () => {
  it('lifts the exception with a parsed type and the enclosing node', () => {
    const r = parse(`14:22:33.0 (1000000)|METHOD_ENTRY|[1]|MyClass.myMethod()
14:22:33.0 (2000000)|EXCEPTION_THROWN|[2]|System.NullPointerException: Attempt to de-reference a null object
14:22:33.0 (3000000)|METHOD_EXIT|[3]|MyClass.myMethod()`);

    expect(r.exceptions.length).toBe(1);
    expect(r.exceptions[0]!.exceptionType).toBe('System.NullPointerException');
    const method = r.executionTree!.children[0] as ExecutionNode;
    expect(r.exceptions[0]!.parentNodeId).toBe(method.id);
    expect(r.metrics.exceptionCount).toBe(1);
  });

  it('attaches trailing untimestamped lines as the stack trace', () => {
    const r = parse(`14:22:33.0 (1000000)|METHOD_ENTRY|[1]|MyClass.m()
14:22:33.0 (2000000)|FATAL_ERROR|System.DmlException: Insert failed
Class.MyClass.m: line 10, column 1
Trigger.T: line 3, column 1`);
    expect(r.exceptions[0]!.stackTrace).toEqual([
      'Class.MyClass.m: line 10, column 1',
      'Trigger.T: line 3, column 1',
    ]);
  });
});

describe('SalesforceLogParser — non-Apex categories', () => {
  it('parses a validation-only log with pass/fail (no method events)', () => {
    const r = parse(`14:00:00.0 (100)|VALIDATION_RULE|03d3t000000UtwD|Blank_Lead_Created_Date
14:00:00.0 (200)|VALIDATION_FORMULA|AND(ISNEW(), ISBLANK( Lead_Created_Date__c ))|Lead_Created_Date__c=null
14:00:00.0 (300)|VALIDATION_FAIL`);

    const stmts = r.executionTree!.children as StatementEvent[];
    expect(stmts.length).toBe(3);
    expect(stmts.every((s) => s.type === 'VALIDATION')).toBe(true);
    expect(stmts[2]!.validationResult).toBe('FAIL');
    expect(r.exceptions.length).toBe(0);
  });
});

describe('SalesforceLogParser — governor limits', () => {
  it('parses a cumulative limit-usage block into namespaces', () => {
    const r = parse(`14:00:00.0 (100)|CUMULATIVE_LIMIT_USAGE
14:00:00.0 (100)|LIMIT_USAGE_FOR_NS|(default)|
  Number of SOQL queries: 3 out of 100
  Number of query rows: 5 out of 50000
  Number of DML statements: 2 out of 150
  Maximum CPU time: 120 out of 10000
14:00:00.0 (100)|CUMULATIVE_LIMIT_USAGE_END`);

    expect(r.governorLimits).not.toBeNull();
    const def = r.governorLimits!.namespaces['default']!;
    expect(def.length).toBe(4);
    const cpu = def.find((l) => /CPU/i.test(l.name))!;
    expect(cpu.used).toBe(120);
    expect(cpu.allowed).toBe(10000);
    expect(r.metrics.cpuTimeMs).toBe(120);
  });
});

describe('SalesforceLogParser — SOQL/DML detail & trigger typing', () => {
  it('extracts SOQL rows, DML op/object/rows, and marks triggers', () => {
    const r = parse(`14:00:00.0 (100)|CODE_UNIT_STARTED|[EXTERNAL]|MyTrigger on Account trigger event BeforeInsert|__sfdc_trigger/MyTrigger
14:00:00.0 (200)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account
14:00:00.0 (300)|SOQL_EXECUTE_END|[10]|Rows:5
14:00:00.0 (400)|DML_BEGIN|[12]|Op:Insert|Type:Account|Rows:3
14:00:00.0 (500)|DML_END|[12]
14:00:00.0 (600)|CODE_UNIT_FINISHED|MyTrigger`);

    const trigger = r.executionTree!.children[0] as ExecutionNode;
    expect(trigger.type).toBe('TRIGGER');

    const soql = trigger.children.find((c) => c.type === 'SOQL') as ExecutionNode;
    expect(soql.soqlRows).toBe(5);
    const dml = trigger.children.find((c) => c.type === 'DML') as ExecutionNode;
    expect(dml.dmlAction).toBe('Insert');
    expect(dml.dmlObject).toBe('Account');
    expect(dml.dmlRows).toBe(3);

    expect(r.metrics.totalSoql).toBe(1);
    expect(r.metrics.totalSoqlRows).toBe(5);
    expect(r.metrics.totalDml).toBe(1);
    expect(r.metrics.totalDmlRows).toBe(3);
  });
});

describe('SalesforceLogParser — robustness', () => {
  it('flags truncation and force-closes open nodes', () => {
    const r = parse(`14:00:00.0 (100)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass
14:00:00.0 (200)|METHOD_ENTRY|[1]|MyClass.foo()
*** MAXIMUM DEBUG LOG SIZE REACHED ***`);

    expect(r.truncated).toBe(true);
    const codeUnit = r.executionTree!.children[0] as ExecutionNode;
    const method = codeUnit.children[0] as ExecutionNode;
    expect(method.unclosed).toBe(true);
  });

  it('never throws on unknown events and keeps them as generic statements', () => {
    const r = parse(`14:00:00.0 (100)|SOME_FUTURE_EVENT|[1]|whatever payload`);
    const stmt = r.executionTree!.children[0] as StatementEvent;
    expect(stmt.type).toBe('GENERIC');
    expect(stmt.text).toBe('whatever payload');
  });
});
