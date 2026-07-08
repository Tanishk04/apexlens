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
