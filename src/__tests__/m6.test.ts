import { SalesforceLogParser } from '../parser';
import { buildRawRows, visibleRawRows } from '../app/utils/rawTree';
import { isEntryEvent } from '../events';
import type { ExecutionNode } from '../types';

const HEADER = '67.0 APEX_CODE,FINEST;APEX_PROFILING,INFO\n';

function parse(body: string) {
  const p = new SalesforceLogParser();
  p.parseChunk(HEADER + body);
  return p.finish();
}

describe('parser rollups (per-node metrics)', () => {
  it('rolls up SOQL/DML counts, rows and self time through the tree', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass.run',
      '10:00:00.0 (3000000)|METHOD_ENTRY|[1]|Outer.run',
      '10:00:00.0 (4000000)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account',
      '10:00:00.0 (6000000)|SOQL_EXECUTE_END|[10]|Rows:5',
      '10:00:00.0 (7000000)|DML_BEGIN|[12]|Op:Insert|Type:Account|Rows:2',
      '10:00:00.0 (8000000)|DML_END|[12]',
      '10:00:00.0 (12000000)|METHOD_EXIT|[1]|Outer.run',
      '10:00:00.0 (13000000)|CODE_UNIT_FINISHED|MyClass.run',
      '10:00:00.0 (14000000)|EXECUTION_FINISHED',
    ].join('\n');

    const tree = parse(body).executionTree!;
    const codeUnit = tree.children.find(
      (c): c is ExecutionNode => 'children' in c && c.type === 'CODE_UNIT',
    )!;
    const method = codeUnit.children.find(
      (c): c is ExecutionNode => 'children' in c && c.type === 'METHOD',
    )!;

    // Subtree totals propagate to every ancestor.
    expect(codeUnit.totSoql).toBe(1);
    expect(codeUnit.totDml).toBe(1);
    expect(codeUnit.totSoqlRows).toBe(5);
    expect(codeUnit.totDmlRows).toBe(2);
    expect(method.totSoql).toBe(1);

    // Self = total minus direct children. Method: 9ms total, children 2+1=3ms.
    expect(Math.round((method.selfNs ?? 0) / 1e6)).toBe(6);
    // Code unit: 11ms total, child method 9ms → 2ms self.
    expect(Math.round((codeUnit.selfNs ?? 0) / 1e6)).toBe(2);
  });
});

describe('FINEST noise events never pair (real-org log regression)', () => {
  it('VARIABLE_SCOPE_BEGIN does not open a tree node', () => {
    expect(isEntryEvent('VARIABLE_SCOPE_BEGIN')).toBe(false);
    expect(isEntryEvent('HEAP_ALLOCATE')).toBe(false);

    // 3 unpaired VARIABLE_SCOPE_BEGIN inside a method must not corrupt nesting.
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|METHOD_ENTRY|[1]|A.run',
      '10:00:00.0 (2100000)|VARIABLE_SCOPE_BEGIN|[2]|x|Integer|false|false',
      '10:00:00.0 (2200000)|VARIABLE_SCOPE_BEGIN|[3]|y|Integer|false|false',
      '10:00:00.0 (2300000)|VARIABLE_SCOPE_BEGIN|[4]|z|Integer|false|false',
      '10:00:00.0 (4000000)|METHOD_EXIT|[1]|A.run',
      '10:00:00.0 (5000000)|EXECUTION_FINISHED',
    ].join('\n');

    const tree = parse(body).executionTree!;
    const method = tree.children.find(
      (c): c is ExecutionNode => 'children' in c && c.type === 'METHOD',
    );
    expect(method).toBeDefined();
    expect(method!.unclosed).toBeUndefined();
    expect(Math.round(method!.durationNs / 1e6)).toBe(2);
  });
});

describe('buildRawRows (Raw Tree)', () => {
  const body = [
    '10:00:00.0 (1000000)|EXECUTION_STARTED',
    '10:00:00.0 (2000000)|METHOD_ENTRY|[1]|A.run',
    '10:00:00.0 (2100000)|STATEMENT_EXECUTE|[2]',
    '10:00:00.0 (2200000)|HEAP_ALLOCATE|[2]|Bytes:8',
    '10:00:00.0 (2300000)|VARIABLE_ASSIGNMENT|[2]|x|1',
    '10:00:00.0 (4000000)|METHOD_EXIT|[1]|A.run',
    '10:00:00.0 (5000000)|EXECUTION_FINISHED',
  ].join('\n');

  it('nests ALL events (including noise) under their entry event', () => {
    const rows = buildRawRows(parse(body).eventLines);
    const byEvent = (e: string) => rows.find((r) => r.event === e)!;

    expect(byEvent('METHOD_ENTRY').depth).toBe(0);
    expect(byEvent('STATEMENT_EXECUTE').depth).toBe(1);
    expect(byEvent('HEAP_ALLOCATE').depth).toBe(1);
    expect(byEvent('VARIABLE_ASSIGNMENT').depth).toBe(1);
    expect(byEvent('METHOD_EXIT').depth).toBe(0);
    expect(byEvent('METHOD_ENTRY').expandable).toBe(true);
    expect(byEvent('HEAP_ALLOCATE').expandable).toBe(false);
    // Nothing dropped: every parsed event line appears.
    expect(rows.length).toBe(parse(body).eventLines.length);
  });

  it('visibleRawRows hides descendants of a collapsed entry', () => {
    const rows = buildRawRows(parse(body).eventLines);
    const entry = rows.find((r) => r.event === 'METHOD_ENTRY')!;
    const visible = visibleRawRows(rows, new Set([entry.id]));
    expect(visible.some((r) => r.event === 'STATEMENT_EXECUTE')).toBe(false);
    expect(visible.some((r) => r.event === 'METHOD_ENTRY')).toBe(true);
    expect(visible.some((r) => r.event === 'METHOD_EXIT')).toBe(true);
  });
});

describe('USER_DEBUG extraction (Debug tab source)', () => {
  it('keeps level and message in eventLines payload', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|METHOD_ENTRY|[1]|A.run',
      '10:00:00.0 (2500000)|USER_DEBUG|[7]|INFO|hello world',
      '10:00:00.0 (4000000)|METHOD_EXIT|[1]|A.run',
      '10:00:00.0 (5000000)|EXECUTION_FINISHED',
    ].join('\n');

    const lines = parse(body).eventLines.filter((l) => l.event === 'USER_DEBUG');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.payload).toBe('INFO|hello world');
    expect(lines[0]!.lineNumber).toBe(7);
  });
});
