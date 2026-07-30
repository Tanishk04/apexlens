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
    // Jump-to-Log-Explorer needs every occurrence's raw line, not just the
    // first — a loop row aggregates several distinct executions.
    expect(a.soql[0]!.rawLines).toEqual([4, 6]);
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

  /**
   * All five of these events produce a node with type FLOW, but only the first
   * is flow work — the shape found in a real workflow-heavy log where they
   * doubled every flow (once by id, once by name) and added an interview-count
   * row literally named "1".
   */
  it('counts a flow interview once and excludes id-only, counter and code-unit rows', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Case',
      '10:00:00.0 (3000000)|FLOW_START_INTERVIEWS_BEGIN|1',
      '10:00:00.0 (4000000)|FLOW_CREATE_INTERVIEW_BEGIN|00Dfc000001|30010000000g2B0|30110000000gE5n',
      '10:00:00.0 (5000000)|FLOW_START_INTERVIEW_BEGIN|2508b579-463f|Update_L4_Queue',
      '10:00:00.0 (7000000)|FLOW_START_INTERVIEW_END|2508b579-463f|Update_L4_Queue',
      '10:00:00.0 (8000000)|FLOW_START_INTERVIEWS_END|1',
      '10:00:00.0 (9000000)|CODE_UNIT_FINISHED|Flow:Case',
      '10:00:00.0 (10000000)|EXECUTION_FINISHED',
    ].join('\n');

    const a = analyze(parse(body).executionTree);
    expect(a.flow).toHaveLength(1);
    expect(a.flow[0]!.element).toBe('Update_L4_Queue');
    expect(a.flow.some((f) => f.element === '1')).toBe(false);
    expect(a.flow.some((f) => f.element === '30110000000gE5n')).toBe(false);

    // The same two bookkeeping events must not leak into Execution Analysis
    // either — reported from a real log as rows literally named "1" and a
    // bare 18-char ID, with nothing to tell a user what they were.
    expect(a.methods.some((m) => m.name === '1')).toBe(false);
    expect(a.methods.some((m) => m.name === '30110000000gE5n')).toBe(false);
    // But the code unit whose type is overridden to FLOW (`Flow:Case`) is a
    // real code unit with a real name and real timing — it must still show.
    expect(a.methods.some((m) => m.name === 'Flow:Case' && m.type === 'FLOW')).toBe(true);
  });

  it('counts a flow element separately from its interview', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|FLOW_START_INTERVIEW_BEGIN|abc-123|My_Flow',
      '10:00:00.0 (3000000)|FLOW_ELEMENT_BEGIN|abc-123|Assignment|Set_Status',
      '10:00:00.0 (4000000)|FLOW_ELEMENT_END|abc-123|Assignment|Set_Status',
      '10:00:00.0 (5000000)|FLOW_START_INTERVIEW_END|abc-123|My_Flow',
      '10:00:00.0 (6000000)|EXECUTION_FINISHED',
    ].join('\n');

    const a = analyze(parse(body).executionTree);
    expect(a.flow.map((f) => f.element).sort()).toEqual(['My_Flow', 'Set_Status']);
  });

  /**
   * Two bugs in one: an interview's Flow and Element columns previously showed
   * the identical string (flowName was hardcoded to node.name), and an
   * element's Flow column was hardcoded blank — so once a log contained real
   * flow elements, "which flow is this in" was unanswerable from the table.
   */
  it('gives an interview a name without duplicating it into Flow, and gives its element the real flow name', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|FLOW_START_INTERVIEW_BEGIN|abc-123|My_Flow',
      '10:00:00.0 (3000000)|FLOW_ELEMENT_BEGIN|abc-123|Assignment|Set_Status',
      '10:00:00.0 (4000000)|FLOW_ELEMENT_END|abc-123|Assignment|Set_Status',
      '10:00:00.0 (5000000)|FLOW_START_INTERVIEW_END|abc-123|My_Flow',
      '10:00:00.0 (6000000)|EXECUTION_FINISHED',
    ].join('\n');

    const a = analyze(parse(body).executionTree);
    const interview = a.flow.find((f) => f.element === 'My_Flow')!;
    const element = a.flow.find((f) => f.element === 'Set_Status')!;
    expect(interview.flow).toBe(''); // not duplicated
    expect(element.flow).toBe('My_Flow'); // previously always blank
  });

  it('a nested element inherits its flow name through an intermediate element, not just from the interview', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|FLOW_START_INTERVIEW_BEGIN|abc-123|Outer_Flow',
      '10:00:00.0 (3000000)|FLOW_ELEMENT_BEGIN|abc-123|Loop|Outer_Loop',
      '10:00:00.0 (4000000)|FLOW_ELEMENT_BEGIN|abc-123|Assignment|Inner_Assignment',
      '10:00:00.0 (5000000)|FLOW_ELEMENT_END|abc-123|Assignment|Inner_Assignment',
      '10:00:00.0 (6000000)|FLOW_ELEMENT_END|abc-123|Loop|Outer_Loop',
      '10:00:00.0 (7000000)|FLOW_START_INTERVIEW_END|abc-123|Outer_Flow',
      '10:00:00.0 (8000000)|EXECUTION_FINISHED',
    ].join('\n');

    const a = analyze(parse(body).executionTree);
    const inner = a.flow.find((f) => f.element === 'Inner_Assignment')!;
    expect(inner.flow).toBe('Outer_Flow');
  });
});
