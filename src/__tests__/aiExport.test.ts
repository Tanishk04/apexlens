import { SalesforceLogParser } from '../parser';
import { analyze } from '../app/utils/analysis';
import { buildAiContext } from '../ai/context';
import { toMarkdown } from '../app/utils/exportMarkdown';

const LOG = [
  '61.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO',
  '10:00:00.0 (1000000)|EXECUTION_STARTED',
  '10:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass.run',
  '10:00:00.0 (3000000)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account',
  '10:00:00.0 (5000000)|SOQL_EXECUTE_END|[10]|Rows:5',
  '10:00:00.0 (6000000)|DML_BEGIN|[12]|Op:Insert|Type:Account|Rows:2',
  '10:00:00.0 (7000000)|DML_END|[12]',
  '10:00:00.0 (8000000)|EXCEPTION_THROWN|[15]|System.NullPointerException: boom',
  '10:00:00.0 (9000000)|CODE_UNIT_FINISHED|MyClass.run',
  '10:00:00.0 (9500000)|CUMULATIVE_LIMIT_USAGE',
  '10:00:00.0 (9500000)|LIMIT_USAGE_FOR_NS|(default)|',
  '  Number of SOQL queries: 1 out of 100',
  '  Maximum CPU time: 4200 out of 10000',
  '10:00:00.0 (9600000)|CUMULATIVE_LIMIT_USAGE_END',
  '10:00:00.0 (10000000)|EXECUTION_FINISHED',
].join('\n');

function parsed() {
  const p = new SalesforceLogParser();
  p.parseChunk(LOG);
  return p.finish();
}

describe('buildAiContext', () => {
  it('produces a compact structured summary without raw log lines', () => {
    const log = parsed();
    const ctx = buildAiContext(log, analyze(log.executionTree));

    expect(ctx.summary.soql).toBe(1);
    expect(ctx.summary.dml).toBe(1);
    expect(ctx.summary.exceptions).toBe(1);
    expect(ctx.exceptions[0]!.type).toBe('System.NullPointerException');
    expect(ctx.exceptions[0]!.lineNumber).toBe(15);
    // Only used limits are carried.
    expect(ctx.limits.every((l) => l.used > 0)).toBe(true);
    expect(ctx.limits.some((l) => /CPU/i.test(l.name))).toBe(true);

    // The serialized context must never contain raw event tokens.
    const json = JSON.stringify(ctx);
    expect(json).not.toContain('EXECUTION_STARTED');
    expect(json).not.toContain('SOQL_EXECUTE_BEGIN');
  });
});

describe('toMarkdown', () => {
  it('renders a report with summary, exception and limits sections', () => {
    const log = parsed();
    const md = toMarkdown(log, analyze(log.executionTree));

    expect(md).toContain('# Salesforce Debug Log Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Exceptions');
    expect(md).toContain('System.NullPointerException');
    expect(md).toContain('## Governor Limits');
    expect(md).toContain('Maximum CPU time');
  });
});
