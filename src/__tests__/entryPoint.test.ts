import { parseEntryPoint, formatEntryPoint, isMeaningfulEntryPoint, refineFlowEntryPoint } from '../entryPoint';
import { SalesforceLogParser } from '../parser';

/**
 * The first four payloads are copied verbatim from the reference logs in
 * `test_logs/` (a production org on API 67.0) — they are what this feature
 * actually has to handle, not what we imagine logs look like.
 */
describe('parseEntryPoint — payload shapes observed in real logs', () => {
  it('reads an Aura/LWC controller action', () => {
    expect(parseEntryPoint('[EXTERNAL]|apex://STS_GeneralUtilityS360/ACTION$getAllSizes')).toEqual({
      type: 'Apex',
      className: 'STS_GeneralUtilityS360',
      methodName: 'getAllSizes',
    });
  });

  it('reads a Class.method() unit and drops the entity id', () => {
    expect(
      parseEntryPoint('[EXTERNAL]|01p2x000008NJJ0|STS_GeneralUtilityS360.getAllSizes()'),
    ).toEqual({
      type: 'Apex',
      className: 'STS_GeneralUtilityS360',
      methodName: 'getAllSizes',
    });
  });

  it('keeps the method name when the signature has parameters', () => {
    expect(
      parseEntryPoint('[EXTERNAL]|01pg50000095Nq1|CaseCommandPanelController.getCaseCommandPanelData(Id)'),
    ).toEqual({
      type: 'Apex',
      className: 'CaseCommandPanelController',
      methodName: 'getCaseCommandPanelData',
    });
  });

  it('reads a trigger as its DML operation, not Before/After timing, ignoring the __sfdc_trigger field', () => {
    // The operation (Update/Insert/Delete/Undelete) is what a user scans a
    // log list for; Before/After is real but secondary, and "BeforeUpdate"
    // run together as one word is not what belongs in a Method column.
    expect(
      parseEntryPoint(
        '[EXTERNAL]|01q000000000001|AccountTrigger on Account trigger event BeforeUpdate|__sfdc_trigger/AccountTrigger',
      ),
    ).toEqual({
      type: 'Trigger',
      className: 'AccountTrigger',
      methodName: 'Update',
    });
  });

  it('reads every trigger operation regardless of Before/After timing', () => {
    expect(parseEntryPoint('[EXTERNAL]|T on Account trigger event AfterInsert').methodName).toBe('Insert');
    expect(parseEntryPoint('[EXTERNAL]|T on Account trigger event BeforeDelete').methodName).toBe('Delete');
    expect(parseEntryPoint('[EXTERNAL]|T on Account trigger event AfterUndelete').methodName).toBe('Undelete');
  });

  it('falls back to showing the raw event and object for an unrecognized trigger timing', () => {
    // A future/unfamiliar event string must still tell the user something
    // real rather than guessing at an operation that isn't there.
    expect(
      parseEntryPoint('[EXTERNAL]|T on Account trigger event SomeFutureEvent').methodName,
    ).toBe('SomeFutureEvent on Account');
  });

  it('reads a flow', () => {
    expect(parseEntryPoint('[EXTERNAL]|Flow:301000000000abc')).toEqual({
      type: 'Flow',
      className: '301000000000abc',
      methodName: '',
    });
  });
});

describe('parseEntryPoint — shapes not present in the reference logs', () => {
  it('reads a Visualforce page', () => {
    expect(parseEntryPoint('[EXTERNAL]|VF: /apex/MyPage')).toEqual({
      type: 'Visualforce',
      className: '/apex/MyPage',
      methodName: '',
    });
  });

  it('reads a workflow', () => {
    expect(parseEntryPoint('[EXTERNAL]|Workflow:01Q000000000abc')).toEqual({
      type: 'Workflow',
      className: '01Q000000000abc',
      methodName: '',
    });
  });

  it('recognises anonymous apex', () => {
    expect(parseEntryPoint('[EXTERNAL]|execute_anonymous_apex').type).toBe('Anonymous');
  });

  it('treats batch/queueable entry points as ordinary Apex methods', () => {
    expect(parseEntryPoint('[EXTERNAL]|01p000000000001|MyBatch.execute()')).toEqual({
      type: 'Apex',
      className: 'MyBatch',
      methodName: 'execute',
    });
  });

  it('keeps a namespaced class intact', () => {
    expect(parseEntryPoint('[EXTERNAL]|01p000000000001|ns.MyClass.doWork(Id)')).toEqual({
      type: 'Apex',
      className: 'ns.MyClass',
      methodName: 'doWork',
    });
  });
});

describe('parseEntryPoint — degradation', () => {
  it('returns Unknown for an empty payload rather than throwing', () => {
    expect(parseEntryPoint('')).toEqual({ type: 'Unknown', className: '', methodName: '' });
  });

  it('returns Unknown when the payload is only markers and ids', () => {
    expect(parseEntryPoint('[EXTERNAL]|01p2x000008NJJ0')).toEqual({
      type: 'Unknown',
      className: '',
      methodName: '',
    });
  });

  it('surfaces an unfamiliar unit instead of blanking the cell', () => {
    // A future/unknown code-unit format must still tell the user something.
    const entry = parseEntryPoint('[EXTERNAL]|SomeFutureUnit ZZZ');
    expect(entry.type).toBe('Unknown');
    expect(entry.className).toBe('SomeFutureUnit ZZZ');
  });
});

describe('isMeaningfulEntryPoint', () => {
  /**
   * A real log opened with `CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS` — a bare
   * phase-boundary marker wrapping the whole bulk trigger phase, with no
   * class or method of its own — moments before the actual
   * `STS_CreateLocations.createLocation(...)` that did the work. Reported by
   * a user comparing against another extension that showed the real class;
   * ours showed "Unknown / TRIGGERS" because it stopped at the marker.
   */
  it('rejects a bare phase-boundary marker like TRIGGERS', () => {
    expect(isMeaningfulEntryPoint(parseEntryPoint('[EXTERNAL]|TRIGGERS'))).toBe(false);
  });

  it('accepts a real class.method entry point', () => {
    expect(
      isMeaningfulEntryPoint(parseEntryPoint('[EXTERNAL]|01p2x000007kDtu|STS_CreateLocations.createLocation(List<Id>)')),
    ).toBe(true);
  });

  it('accepts a trigger, flow, and workflow', () => {
    expect(
      isMeaningfulEntryPoint(
        parseEntryPoint('[EXTERNAL]|01q000000000001|AccountTrigger on Account trigger event BeforeUpdate'),
      ),
    ).toBe(true);
    expect(isMeaningfulEntryPoint(parseEntryPoint('[EXTERNAL]|Flow:301000000000abc'))).toBe(true);
  });

  it('accepts an unfamiliar-but-punctuated label rather than discarding it', () => {
    expect(isMeaningfulEntryPoint(parseEntryPoint('[EXTERNAL]|SomeFutureUnit ZZZ'))).toBe(true);
  });

  it('rejects a fully empty payload', () => {
    expect(isMeaningfulEntryPoint(parseEntryPoint(''))).toBe(false);
  });
});

describe('refineFlowEntryPoint', () => {
  /**
   * Real log: `CODE_UNIT_STARTED|[EXTERNAL]|Flow:Case` — the object a
   * record-triggered flow fired on, not which flow ran. The real name
   * (`Case_Update_Pilot_From_Owner`) shows up moments later as the last pipe
   * field of FLOW_CREATE_INTERVIEW_END / FLOW_START_INTERVIEW_BEGIN. Reported
   * by a user confused why the entry point just said "Flow / Case".
   */
  const objectWrapper = parseEntryPoint('[EXTERNAL]|Flow:Case');

  it('prefers the real flow name from FLOW_CREATE_INTERVIEW_END', () => {
    const refined = refineFlowEntryPoint(
      objectWrapper,
      'FLOW_CREATE_INTERVIEW_END',
      '5121e8856474d32711aa333d8b7019fae36fb3b-3f3d|Case_Update_Pilot_From_Owner',
    );
    expect(refined).toEqual({ type: 'Flow', className: 'Case_Update_Pilot_From_Owner', methodName: '' });
  });

  it('prefers the real flow name from FLOW_START_INTERVIEW_BEGIN', () => {
    const refined = refineFlowEntryPoint(
      objectWrapper,
      'FLOW_START_INTERVIEW_BEGIN',
      '5121e8856474d32711aa333d8b7019fae36fb3b-3f3d|Case_Update_Pilot_From_Owner',
    );
    expect(refined.className).toBe('Case_Update_Pilot_From_Owner');
  });

  it('leaves unrelated events untouched', () => {
    expect(refineFlowEntryPoint(objectWrapper, 'SOQL_EXECUTE_BEGIN', 'x')).toBe(objectWrapper);
  });

  it('only refines Flow entries, never Trigger/Apex/etc', () => {
    const trigger = parseEntryPoint(
      '[EXTERNAL]|01q000000000001|AccountTrigger on Account trigger event BeforeUpdate',
    );
    expect(refineFlowEntryPoint(trigger, 'FLOW_START_INTERVIEW_BEGIN', 'id|RealFlowName')).toBe(trigger);
  });
});

describe('formatEntryPoint', () => {
  it('joins class and method, and omits the dot when there is no method', () => {
    expect(formatEntryPoint({ type: 'Apex', className: 'A', methodName: 'b' })).toBe('A.b');
    expect(formatEntryPoint({ type: 'Flow', className: 'F', methodName: '' })).toBe('F');
    expect(formatEntryPoint({ type: 'Unknown', className: '', methodName: '' })).toBe('');
  });
});

describe('integration with the parser', () => {
  /**
   * Real transactions emit two CODE_UNIT_STARTED lines — the outer Aura action
   * and the inner Class.method(). The first is the true entry point; taking the
   * last would report an implementation detail instead of what was invoked.
   */
  it('the first CODE_UNIT_STARTED is the entry point', () => {
    const log = [
      '67.0 APEX_CODE,FINEST;APEX_PROFILING,FINEST',
      '17:19:47.0 (1000000)|EXECUTION_STARTED',
      '17:19:47.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|apex://STS_GeneralUtilityS360/ACTION$getAllSizes',
      '17:19:47.0 (3000000)|CODE_UNIT_STARTED|[EXTERNAL]|01p2x000008NJJ0|STS_GeneralUtilityS360.getAllSizes()',
      '17:19:47.0 (4000000)|CODE_UNIT_FINISHED|STS_GeneralUtilityS360.getAllSizes()',
      '17:19:47.0 (5000000)|EXECUTION_FINISHED',
    ].join('\n');

    const parser = new SalesforceLogParser();
    parser.parseChunk(log);
    const parsed = parser.finish();

    const first = parsed.eventLines.find((l) => l.event === 'CODE_UNIT_STARTED');
    expect(first).toBeDefined();
    expect(parseEntryPoint(first!.payload)).toEqual({
      type: 'Apex',
      className: 'STS_GeneralUtilityS360',
      methodName: 'getAllSizes',
    });
  });
});
