import { formatEventLabel, isNoiseEvent, shouldDisplayEvent } from '../logDisplay';

describe('logDisplay', () => {
  it('formats Salesforce log events with useful labels', () => {
    expect(
      formatEventLabel(
        'CODE_UNIT_STARTED',
        '[EXTERNAL]|01pg50000095Nq1|CaseCommandPanelController.getCaseCommandPanelData(Id)',
      ),
    ).toBe('CaseCommandPanelController.getCaseCommandPanelData(Id)');

    expect(
      formatEventLabel(
        'CODE_UNIT_STARTED',
        '[EXTERNAL]|apex://CaseCommandPanelController/ACTION$getCaseCommandPanelData',
      ),
    ).toBe('CaseCommandPanelController/ACTION$getCaseCommandPanelData');

    expect(
      formatEventLabel(
        'SOQL_EXECUTE_BEGIN',
        'Aggregations:0|SELECT Id, CaseNumber FROM Case WHERE Id = :tmpVar1 LIMIT 1',
      ),
    ).toBe('SELECT Id, CaseNumber FROM Case WHERE Id = :tmpVar1 LIMIT 1');

    expect(
      formatEventLabel('METHOD_ENTRY', '[32]|01pg50000095Nq1|CaseCommandPanelController.queryCase(Id)'),
    ).toBe('CaseCommandPanelController.queryCase(Id)');
  });

  describe('USER_DEBUG messages', () => {
    // The Lexer strips the `[line]` token into LogToken.lineNumber, so payload
    // here is LEVEL|message — not [line]|LEVEL|message.
    it('keeps the whole message after the level', () => {
      expect(formatEventLabel('USER_DEBUG', 'DEBUG|Hello World')).toBe('Hello World');
    });

    it('preserves pipes inside the message', () => {
      expect(formatEventLabel('USER_DEBUG', 'DEBUG|Name|Value')).toBe('Name|Value');
      expect(formatEventLabel('USER_DEBUG', 'ERROR|a|b|c')).toBe('a|b|c');
    });

    it('survives a message-only payload', () => {
      expect(formatEventLabel('USER_DEBUG', 'bare message')).toBe('bare message');
    });
  });

  describe('workflow event labels', () => {
    /**
     * Real payload from a workflow-heavy log: without a special case, the
     * default formatter (last pipe field) picked the evaluation order — always
     * a small integer — instead of the rule name. That showed up as rows
     * literally named "0" in the Execution Analysis table.
     */
    it('extracts the rule name from WF_CRITERIA_BEGIN, not the trailing eval order', () => {
      expect(
        formatEventLabel(
          'WF_CRITERIA_BEGIN',
          '[Work Order: WO-00163432 a2Hfc0000006T7O]|GE EM Location Vessel|01Q10000000kPrH|ON_ALL_CHANGES|0',
        ),
      ).toBe('GE EM Location Vessel');
    });

    it('falls back to the last field if the payload has fewer than 5 parts', () => {
      expect(formatEventLabel('WF_CRITERIA_BEGIN', 'x|y')).toBe('y');
    });

    /**
     * WF_FLOW_ACTION_BEGIN carries only a bare id, no name field at all. Label
     * it rather than show the id alone, but keep the id — collapsing every
     * distinct flow action to one generic "Flow Action" bucket would merge
     * genuinely different actions in the Analysis tables.
     */
    it('labels a flow action while keeping its id distinguishable', () => {
      expect(formatEventLabel('WF_FLOW_ACTION_BEGIN', '09L2x000000aY7V')).toBe(
        'Flow Action 09L2x000000aY7V',
      );
    });
  });

  describe('Flow interview bookkeeping events', () => {
    /**
     * Reported from a real log: these two events showed up in the Execution
     * Tree (and, before a separate fix, Execution Analysis) as rows literally
     * named "1" or a bare 18-char ID — the default last-field formatter had
     * nothing better to extract, since neither payload carries a name.
     */
    it('labels FLOW_CREATE_INTERVIEW_BEGIN instead of surfacing one of its bare internal IDs', () => {
      expect(
        formatEventLabel(
          'FLOW_CREATE_INTERVIEW_BEGIN',
          '00Dfc000001hq9F|300fC00000MyRwj|301fC00000OiZ4H',
        ),
      ).toBe('Create Interview');
    });

    it('labels FLOW_START_INTERVIEWS_BEGIN, keeping the count rather than showing it bare', () => {
      expect(formatEventLabel('FLOW_START_INTERVIEWS_BEGIN', '1')).toBe('Start Interviews (1)');
      expect(formatEventLabel('FLOW_START_INTERVIEWS_BEGIN', '6')).toBe('Start Interviews (6)');
    });

    it('still shows the real flow name for FLOW_START_INTERVIEW_BEGIN (singular)', () => {
      expect(formatEventLabel('FLOW_START_INTERVIEW_BEGIN', '2508b579-463f|Update_L4_Queue')).toBe(
        'Update_L4_Queue',
      );
    });
  });

  it('hides noisy events by default', () => {
    expect(isNoiseEvent('HEAP_ALLOCATE')).toBe(true);
    expect(isNoiseEvent('VARIABLE_SCOPE_BEGIN')).toBe(true);
    expect(isNoiseEvent('STATEMENT_EXECUTE')).toBe(true);
    expect(shouldDisplayEvent('METHOD_ENTRY')).toBe(true);
    expect(shouldDisplayEvent('SOQL_EXECUTE_BEGIN')).toBe(true);
    expect(shouldDisplayEvent('HEAP_ALLOCATE')).toBe(false);
    expect(shouldDisplayEvent('USER_DEBUG', false)).toBe(false);
    expect(shouldDisplayEvent('USER_DEBUG', true)).toBe(true);
  });
});
