import { tokenizeLine } from '../app/utils/logTokens';
import { computeMatches, splitByMatch } from '../app/utils/find';

describe('tokenizeLine (Log Explorer coloring)', () => {
  const LINES = [
    '67.0 APEX_CODE,FINEST;APEX_PROFILING,INFO',
    '13:16:47.2 (2420536)|EXECUTION_STARTED',
    '13:16:47.2 (53813168)|VARIABLE_ASSIGNMENT|[EXTERNAL]|X.NOT_SPECIFIED|"Not specified"',
    '13:16:47.2 (9029981)|SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id FROM Case',
    '  Number of SOQL queries: 1 out of 100',
    '',
  ];

  it('NEVER mutates the text — concatenated tokens equal the input line', () => {
    for (const line of LINES) {
      const joined = tokenizeLine(line)
        .map((t) => t.text)
        .join('');
      expect(joined).toBe(line);
    }
  });

  it('colors the event name and quoted strings', () => {
    const tokens = tokenizeLine(LINES[2]!);
    const event = tokens.find((t) => t.text === 'VARIABLE_ASSIGNMENT');
    const quoted = tokens.find((t) => t.text === '"Not specified"');
    expect(event?.cls).toBeTruthy();
    expect(quoted?.cls).toBe('text-soql');
  });

  it('marks untimestamped lines muted as a whole', () => {
    const tokens = tokenizeLine(LINES[4]!);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.cls).toBe('text-muted-foreground');
  });
});

describe('find utilities', () => {
  const rows = ['Alpha TRUE beta', 'nothing here', 'true story', 'TRUETRUE'];

  it('computeMatches is case-insensitive by default and case-sensitive on demand', () => {
    expect(computeMatches(rows, 'true', false)).toEqual([0, 2, 3]);
    expect(computeMatches(rows, 'true', true)).toEqual([2]);
    expect(computeMatches(rows, '', false)).toEqual([]);
  });

  it('splitByMatch reconstructs the input exactly and flags matches', () => {
    for (const row of rows) {
      const segs = splitByMatch(row, 'true', false);
      expect(segs.map((s) => s.text).join('')).toBe(row);
    }
    const segs = splitByMatch('TRUETRUE', 'true', false);
    expect(segs.filter((s) => s.match)).toHaveLength(2);
  });
});
