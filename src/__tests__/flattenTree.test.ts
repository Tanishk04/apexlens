import { SalesforceLogParser } from '../parser';
import { flattenExecutionTree } from '../app/utils/flattenTree';

const HEADER = '61.0 APEX_CODE,DEBUG;VALIDATION,INFO\n';

function parse(body: string) {
  const p = new SalesforceLogParser();
  p.parseChunk(HEADER + body);
  return p.finish();
}

describe('flattenExecutionTree — validation result', () => {
  /**
   * The result previously lived only on the node the detail panel reads, so
   * seeing which of a log's validation rules failed meant clicking each one —
   * 51 clicks for the reference log that prompted this. It must survive
   * flattening so the tree row can show it without a click.
   */
  it('carries PASS/FAIL onto the flattened row', () => {
    const body = [
      '14:00:00.0 (100)|VALIDATION_RULE|03d1|Passing_Rule',
      '14:00:00.0 (110)|VALIDATION_FORMULA|ISBLANK(X)',
      '14:00:00.0 (120)|VALIDATION_PASS',
      '14:00:00.0 (200)|VALIDATION_RULE|03d2|Failing_Rule',
      '14:00:00.0 (210)|VALIDATION_FORMULA|ISBLANK(Y)',
      '14:00:00.0 (220)|VALIDATION_FAIL',
    ].join('\n');

    const rows = flattenExecutionTree(parse(body).executionTree);
    expect(rows.map((r) => [r.name, r.validationResult])).toEqual([
      ['Passing_Rule', 'PASS'],
      ['Failing_Rule', 'FAIL'],
    ]);
  });

  it('omits validationResult for non-validation rows', () => {
    const rows = flattenExecutionTree(
      parse('14:00:00.0 (100)|METHOD_ENTRY|[1]|A.run\n14:00:00.0 (200)|METHOD_EXIT|[1]|A.run')
        .executionTree,
    );
    expect(rows[0]!.validationResult).toBeUndefined();
  });
});
