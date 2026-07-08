import { SalesforceLogParser } from '../parser';
import { analyze } from '../app/utils/analysis';

const HEADER = '61.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO;DB,INFO\n';

function parse(body: string) {
  const p = new SalesforceLogParser();
  p.parseChunk(HEADER + body);
  return p.finish();
}

describe('analyze', () => {
  it('aggregates SOQL groups and flags queries in a loop', () => {
    // Same query at the same line number, executed twice → loop.
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass.run',
      '10:00:00.0 (3000000)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account',
      '10:00:00.0 (4000000)|SOQL_EXECUTE_END|[10]|Rows:5',
      '10:00:00.0 (5000000)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account',
      '10:00:00.0 (6000000)|SOQL_EXECUTE_END|[10]|Rows:3',
      '10:00:00.0 (7000000)|CODE_UNIT_FINISHED|MyClass.run',
      '10:00:00.0 (8000000)|EXECUTION_FINISHED',
    ].join('\n');

    const a = analyze(parse(body).executionTree);
    expect(a.soql).toHaveLength(1);
    expect(a.soql[0]!.count).toBe(2);
    expect(a.soql[0]!.totalRows).toBe(8);
    expect(a.soql[0]!.maxRows).toBe(5);
    expect(a.soql[0]!.inLoop).toBe(true);
    expect(a.soqlInLoopCount).toBe(1);
  });

  it('aggregates DML by operation and object with row totals', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|DML_BEGIN|[5]|Op:Insert|Type:Account|Rows:2',
      '10:00:00.0 (3000000)|DML_END|[5]',
      '10:00:00.0 (4000000)|DML_BEGIN|[6]|Op:Insert|Type:Account|Rows:3',
      '10:00:00.0 (5000000)|DML_END|[6]',
      '10:00:00.0 (6000000)|EXECUTION_FINISHED',
    ].join('\n');

    const a = analyze(parse(body).executionTree);
    expect(a.dml).toHaveLength(1);
    expect(a.dml[0]!.action).toBe('Insert');
    expect(a.dml[0]!.object).toBe('Account');
    expect(a.dml[0]!.count).toBe(2);
    expect(a.dml[0]!.totalRows).toBe(5);
  });

  it('computes self time as total minus children', () => {
    // Outer method spans 10ms; inner method spans 4ms → outer self = 6ms.
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|METHOD_ENTRY|[1]|Outer.run',
      '10:00:00.0 (4000000)|METHOD_ENTRY|[2]|Inner.run',
      '10:00:00.0 (8000000)|METHOD_EXIT|[2]|Inner.run',
      '10:00:00.0 (12000000)|METHOD_EXIT|[1]|Outer.run',
      '10:00:00.0 (13000000)|EXECUTION_FINISHED',
    ].join('\n');

    const a = analyze(parse(body).executionTree);
    const outer = a.methods.find((m) => m.name.includes('Outer'));
    const inner = a.methods.find((m) => m.name.includes('Inner'));
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    expect(Math.round(outer!.totalMs)).toBe(10);
    expect(Math.round(outer!.selfMs)).toBe(6);
    expect(Math.round(inner!.selfMs)).toBe(4);
  });

  it('returns empty results for a null tree', () => {
    const a = analyze(null);
    expect(a.soql).toEqual([]);
    expect(a.dml).toEqual([]);
    expect(a.methods).toEqual([]);
  });
});
