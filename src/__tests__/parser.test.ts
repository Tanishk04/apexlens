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
  /**
   * Salesforce reports one rule as three events. They describe a single thing,
   * so they collapse to a single row — otherwise a log with 51 rules (as in the
   * reference workflow log) produced 153 rows, two thirds of them unnamed and
   * meaningless on their own.
   */
  it('folds a validation rule, its formula and its result into one row', () => {
    const r = parse(`14:00:00.0 (100)|VALIDATION_RULE|03d3t000000UtwD|Blank_Lead_Created_Date
14:00:00.0 (200)|VALIDATION_FORMULA|AND(ISNEW(), ISBLANK( Lead_Created_Date__c ))|Lead_Created_Date__c=null
14:00:00.0 (300)|VALIDATION_FAIL`);

    const stmts = r.executionTree!.children as StatementEvent[];
    expect(stmts.length).toBe(1);
    expect(stmts[0]!.type).toBe('VALIDATION');
    expect(stmts[0]!.text).toBe('Blank_Lead_Created_Date');
    expect(stmts[0]!.validationResult).toBe('FAIL');
    // The formula rides along for the detail panel rather than as its own row.
    expect(stmts[0]!.detail).toContain('ISBLANK');
    expect(r.exceptions.length).toBe(0);
  });

  it('groups each rule separately when several run in a row', () => {
    const r = parse(`14:00:00.0 (100)|VALIDATION_RULE|03d1|First_Rule
14:00:00.0 (110)|VALIDATION_FORMULA|AND(
14:00:00.0 (120)|VALIDATION_PASS
14:00:00.0 (200)|VALIDATION_RULE|03d2|Second_Rule
14:00:00.0 (210)|VALIDATION_FORMULA|ISBLANK(X)
14:00:00.0 (220)|VALIDATION_FAIL`);

    const stmts = r.executionTree!.children as StatementEvent[];
    expect(stmts.map((s) => s.text)).toEqual(['First_Rule', 'Second_Rule']);
    expect(stmts.map((s) => s.validationResult)).toEqual(['PASS', 'FAIL']);
  });

  it('captures a multi-line formula into detail, not into the row name', () => {
    // Real formulas span untimestamped lines — 885 of them in the reference log.
    // Those must not end up appended to the rule's name.
    const r = parse(`14:00:00.0 (100)|VALIDATION_RULE|03d1|Cases_Priority_Validation
14:00:00.0 (110)|VALIDATION_FORMULA|AND(
GE_SM_HQ_Forced_Outage__c = TRUE,
NOT(ISPICKVAL(Priority, "High"))
)
14:00:00.0 (120)|VALIDATION_PASS`);

    const stmt = (r.executionTree!.children as StatementEvent[])[0]!;
    expect(stmt.text).toBe('Cases_Priority_Validation');
    expect(stmt.detail).toContain('GE_SM_HQ_Forced_Outage__c');
    expect(stmt.detail).toContain('ISPICKVAL');
    expect(stmt.validationResult).toBe('PASS');
  });

  it('still records a result that arrives without a preceding rule', () => {
    const r = parse('14:00:00.0 (100)|VALIDATION_FAIL');
    const stmts = r.executionTree!.children as StatementEvent[];
    expect(stmts).toHaveLength(1);
    expect(stmts[0]!.validationResult).toBe('FAIL');
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

  /**
   * Salesforce writes a full snapshot per code unit — 17 blocks for one
   * namespace in a real workflow log, 221 rows for 13 real metrics — and the
   * values only ever climb across them. Repeated blocks must collapse to one
   * entry per name holding the highest figure, not accumulate.
   */
  it('collapses repeated snapshots of the same namespace into one metric per name', () => {
    const block = (soql: number, cpu: number) => `14:00:00.0 (100)|CUMULATIVE_LIMIT_USAGE
14:00:00.0 (100)|LIMIT_USAGE_FOR_NS|(default)|
  Number of SOQL queries: ${soql} out of 100
  Maximum CPU time: ${cpu} out of 10000
14:00:00.0 (100)|CUMULATIVE_LIMIT_USAGE_END
`;
    const r = parse(block(0, 190) + block(10, 491) + block(19, 649) + block(30, 1224));

    const def = r.governorLimits!.namespaces['default']!;
    expect(def).toHaveLength(2); // not 4 blocks x 2 metrics = 8
    const soqlNames = def.filter((l) => /SOQL/i.test(l.name));
    expect(soqlNames).toHaveLength(1);
    expect(soqlNames[0]!.used).toBe(30); // the highest reported, not the first
    const cpu = def.find((l) => /CPU/i.test(l.name))!;
    expect(cpu.used).toBe(1224);
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

/**
 * Real FINEST logs from a production org (see test_logs/) drew 20,203 tree rows,
 * 15,777 of them GENERIC — 78% noise, 99.3% of it LIMIT_USAGE. These lock in the
 * classification that fixed it.
 */
describe('event classification (GENERIC is a last resort, not a dumping ground)', () => {
  it('drops the per-statement LIMIT_USAGE meter from the tree', () => {
    const r = parse(`14:00:00.0 (100)|METHOD_ENTRY|[1]|A.run
14:00:00.0 (150)|LIMIT_USAGE|[452]|SCRIPT_STATEMENTS|1|200000
14:00:00.0 (160)|LIMIT_USAGE|[453]|SCRIPT_STATEMENTS|2|200000
14:00:00.0 (200)|METHOD_EXIT|[1]|A.run`);

    const method = r.executionTree!.children[0] as ExecutionNode;
    expect(method.children).toHaveLength(0);
    // Still present in eventLines, so Raw Tree can show every line.
    expect(r.eventLines.filter((l) => l.event === 'LIMIT_USAGE')).toHaveLength(2);
  });

  it('classifies SOQL_EXECUTE_EXPLAIN as SOQL, not GENERIC', () => {
    const r = parse(
      `14:00:00.0 (100)|SOQL_EXECUTE_EXPLAIN|[10]|Index on User : [Id], cardinality: 1, relativeCost 0.001`,
    );
    const stmt = r.executionTree!.children[0] as StatementEvent;
    expect(stmt.category).toBe('SOQL');
  });

  it('keeps BULK_HEAP_ALLOCATE out of the tree alongside its HEAP_* siblings', () => {
    const r = parse(`14:00:00.0 (100)|BULK_HEAP_ALLOCATE|[5]|Bytes:120`);
    expect(r.executionTree!.children).toHaveLength(0);
  });

  it('swallows a STATIC_VARIABLE_LIST body instead of bolting it onto another row', () => {
    const r = parse(`14:00:00.0 (100)|USER_DEBUG|[2]|DEBUG|the real message
14:00:00.0 (200)|STATIC_VARIABLE_LIST|
  int:BYTES:0
  byte[]:DigitOnes:0
  byte[]:DigitTens:0
14:00:00.0 (300)|METHOD_ENTRY|[1]|A.run`);

    const debug = r.executionTree!.children[0] as StatementEvent;
    expect(debug.text).toBe('the real message');
    expect(debug.text).not.toContain('int:BYTES');
    // The block itself is noise — no row of its own either.
    expect(r.executionTree!.children.filter((c) => c.event === 'STATIC_VARIABLE_LIST')).toHaveLength(
      0,
    );
  });

  it('never lets a block body leak into an earlier exception stack trace', () => {
    const r = parse(`14:00:00.0 (100)|FATAL_ERROR|System.DmlException: Insert failed
Class.MyClass.m: line 10, column 1
14:00:00.0 (200)|STATIC_VARIABLE_LIST|
  int:BYTES:0
  byte[]:DigitOnes:0`);

    expect(r.exceptions[0]!.stackTrace).toEqual(['Class.MyClass.m: line 10, column 1']);
  });

  it('reports genuinely unknown events instead of silently inflating GENERIC', () => {
    const r = parse(`14:00:00.0 (100)|ZZZ_FUTURE_EVENT|[1]|payload
14:00:00.0 (200)|ZZZ_FUTURE_EVENT|[2]|payload`);

    // Still rendered — unknown must never mean dropped.
    expect(r.executionTree!.children).toHaveLength(2);
    expect(r.unrecognizedEvents).toEqual({ ZZZ_FUTURE_EVENT: 2 });
  });

  it('leaves unrecognizedEvents absent for a log it fully understands', () => {
    const r = parse(`14:00:00.0 (100)|METHOD_ENTRY|[1]|A.run
14:00:00.0 (150)|USER_DEBUG|[2]|DEBUG|hi
14:00:00.0 (200)|METHOD_EXIT|[1]|A.run`);
    expect(r.unrecognizedEvents).toBeUndefined();
  });
});

/**
 * Unpaired events used to desync the stack permanently: an entry nothing popped
 * got consumed by a later unrelated exit, so every duration after it was
 * attributed one level off, and exits ignoring names meant it never resynced.
 */
describe('unpaired events never desync the execution tree', () => {
  const siblingMethods = (extraLine: string) => `14:00:00.0 (1000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass
14:00:00.0 (2000)|METHOD_ENTRY|[1]|A.first
${extraLine}
14:00:00.0 (4000)|METHOD_EXIT|[1]|A.first
14:00:00.0 (5000)|METHOD_ENTRY|[2]|A.second
14:00:00.0 (7000)|METHOD_EXIT|[2]|A.second
14:00:00.0 (8000)|CODE_UNIT_FINISHED|MyClass`;

  it.each([
    ['SAVEPOINT_SET', '14:00:00.0 (3000)|SAVEPOINT_SET|[3]|sp1'],
    ['WF_APPROVAL_SUBMIT', '14:00:00.0 (3000)|WF_APPROVAL_SUBMIT|[3]|Some approval'],
    ['WF_TIME_TRIGGERS_BEGIN', '14:00:00.0 (3000)|WF_TIME_TRIGGERS_BEGIN'],
    ['WF_SPOOL_ACTION_BEGIN', '14:00:00.0 (3000)|WF_SPOOL_ACTION_BEGIN|[3]|x'],
  ])('a %s does not open a node that swallows later siblings', (_name, line) => {
    const codeUnit = parse(siblingMethods(line)).executionTree!.children[0] as ExecutionNode;
    const methods = codeUnit.children.filter((c) => isNode(c) && c.type === 'METHOD');
    expect(methods).toHaveLength(2);
    expect((methods[0] as ExecutionNode).durationNs).toBe(2000);
    expect((methods[1] as ExecutionNode).durationNs).toBe(2000);
    expect((methods[0] as ExecutionNode).unclosed).toBeUndefined();
  });

  it.each([
    ['SLA_END', '14:00:00.0 (3000)|SLA_END|[3]|x'],
    ['WF_ACTIONS_END', '14:00:00.0 (3000)|WF_ACTIONS_END|[3]|x'],
    // Observed 13 times, unpaired, in a real workflow log — it fires *after*
    // FLOW_START_INTERVIEW_END has already closed the interview. It is absent
    // from Salesforce's published catalog, which is why it was briefly dropped
    // from POINT_EVENTS; the log, not the docs, settled it.
    [
      'FLOW_INTERVIEW_FINISHED',
      '14:00:00.0 (3000)|FLOW_INTERVIEW_FINISHED|2508b579|Case_Update_Pilot_From_Owner',
    ],
  ])('a stray %s closes nothing it did not open', (_name, line) => {
    const codeUnit = parse(siblingMethods(line)).executionTree!.children[0] as ExecutionNode;
    const methods = codeUnit.children.filter((c) => isNode(c) && c.type === 'METHOD');
    expect(methods).toHaveLength(2);
    expect((methods[0] as ExecutionNode).durationNs).toBe(2000);
  });

  it('force-closes intervening nodes when an exit matches further down the stack', () => {
    // The inner SOQL_EXECUTE_BEGIN never gets its END; METHOD_EXIT must still
    // close the method, marking the orphan rather than closing the wrong node.
    const r = parse(`14:00:00.0 (1000)|METHOD_ENTRY|[1]|A.run
14:00:00.0 (2000)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account
14:00:00.0 (5000)|METHOD_EXIT|[1]|A.run`);

    const method = r.executionTree!.children[0] as ExecutionNode;
    expect(method.type).toBe('METHOD');
    expect(method.durationNs).toBe(4000);
    expect(method.unclosed).toBeUndefined();

    const soql = method.children[0] as ExecutionNode;
    expect(soql.unclosed).toBe(true);
  });

  it('still nests unknown future BEGIN/END pairs via the suffix fallback', () => {
    const r = parse(`14:00:00.0 (1000)|ZZZ_THING_BEGIN|[1]|x
14:00:00.0 (2000)|METHOD_ENTRY|[2]|A.inner
14:00:00.0 (3000)|METHOD_EXIT|[2]|A.inner
14:00:00.0 (4000)|ZZZ_THING_END|[1]|x`);

    const outer = r.executionTree!.children[0] as ExecutionNode;
    expect(outer.event).toBe('ZZZ_THING_BEGIN');
    expect(outer.durationNs).toBe(3000);
    expect(outer.children.filter(isNode)).toHaveLength(1);
  });

  /**
   * Real workflow logs show Salesforce logging a bulk workflow action as
   * several identical WF_FLOW_ACTION_BEGINs back-to-back (one per record in
   * the batch) with nothing between them, followed later by an equal-count
   * burst of WF_FLOW_ACTION_ENDs — not one BEGIN/END pair per invocation.
   * Read naively this nests 6 levels deep; they're 6 parallel siblings.
   */
  it('renders a WF_FLOW_ACTION_BEGIN burst as siblings, not 6 levels of nesting', () => {
    const r = parse(`14:00:00.0 (1000)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000000|Workflow
14:00:00.0 (2000)|WF_FLOW_ACTION_BEGIN|09LfC0000003PI3
14:00:00.0 (3000)|WF_FLOW_ACTION_BEGIN|09LfC0000003PI3
14:00:00.0 (4000)|WF_FLOW_ACTION_BEGIN|09LfC0000003PI3
14:00:00.0 (100000)|WF_FLOW_ACTION_END|09LfC0000003PI3
14:00:00.0 (101000)|WF_FLOW_ACTION_END|09LfC0000003PI3
14:00:00.0 (102000)|WF_FLOW_ACTION_END|09LfC0000003PI3
14:00:00.0 (103000)|CODE_UNIT_FINISHED|Workflow`);

    const workflow = r.executionTree!.children[0] as ExecutionNode;
    const actions = workflow.children.filter(isNode);
    expect(actions).toHaveLength(3);
    expect(actions.every((a) => a.type === 'WORKFLOW')).toBe(true);
    // None nested under another — every one is a direct child of Workflow,
    // and none of them has one of its siblings as a child.
    expect(actions.every((a) => a.children.filter(isNode).length === 0)).toBe(true);
  });

  it('still nests a real recursive call of the same event with work done first', () => {
    // Contrast with the burst above: here the outer call does real work
    // (a SOQL query) before the "recursive" entry, so it's genuine nesting,
    // not an artifact burst — must stay nested, not get flattened.
    const r = parse(`14:00:00.0 (1000)|METHOD_ENTRY|[1]|A.recurse()
14:00:00.0 (2000)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account
14:00:00.0 (3000)|SOQL_EXECUTE_END|[2]|Rows:1
14:00:00.0 (4000)|METHOD_ENTRY|[1]|A.recurse()
14:00:00.0 (5000)|METHOD_EXIT|[1]|A.recurse()
14:00:00.0 (6000)|METHOD_EXIT|[1]|A.recurse()`);

    const outer = r.executionTree!.children[0] as ExecutionNode;
    const inner = outer.children.filter((c) => isNode(c) && c.type === 'METHOD') as ExecutionNode[];
    expect(inner).toHaveLength(1);
    expect(inner[0]!.name).toBe('A.recurse()');
  });
});
