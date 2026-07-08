import { SalesforceLogParser } from '../parser';
import { buildFlameLayout } from '../app/utils/flameLayout';

const HEADER = '61.0 APEX_CODE,DEBUG\n';

function parse(body: string) {
  const p = new SalesforceLogParser();
  p.parseChunk(HEADER + body);
  return p.finish();
}

describe('buildFlameLayout', () => {
  it('assigns depth by nesting and captures time extent', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|METHOD_ENTRY|[1]|Outer.run',
      '10:00:00.0 (4000000)|METHOD_ENTRY|[2]|Inner.run',
      '10:00:00.0 (8000000)|METHOD_EXIT|[2]|Inner.run',
      '10:00:00.0 (12000000)|METHOD_EXIT|[1]|Outer.run',
      '10:00:00.0 (13000000)|EXECUTION_FINISHED',
    ].join('\n');

    const { rects, maxDepth, t0, t1 } = buildFlameLayout(parse(body).executionTree);
    const outer = rects.find((r) => r.name.includes('Outer'))!;
    const inner = rects.find((r) => r.name.includes('Inner'))!;
    expect(outer.depth).toBe(0);
    expect(inner.depth).toBe(1);
    expect(maxDepth).toBe(1);
    expect(outer.start).toBe(2_000_000);
    expect(outer.end).toBe(12_000_000);
    expect(t0).toBe(2_000_000);
    expect(t1).toBe(12_000_000);
  });

  it('emits exception markers as points, not rects', () => {
    const body = [
      '10:00:00.0 (1000000)|EXECUTION_STARTED',
      '10:00:00.0 (2000000)|METHOD_ENTRY|[1]|A.run',
      '10:00:00.0 (3000000)|EXCEPTION_THROWN|[5]|System.NullPointerException: boom',
      '10:00:00.0 (4000000)|METHOD_EXIT|[1]|A.run',
      '10:00:00.0 (5000000)|EXECUTION_FINISHED',
    ].join('\n');

    const { rects, markers } = buildFlameLayout(parse(body).executionTree);
    expect(rects).toHaveLength(1);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.timestamp).toBe(3_000_000);
  });

  it('returns an empty layout for a null tree', () => {
    const { rects, markers, t0, t1 } = buildFlameLayout(null);
    expect(rects).toEqual([]);
    expect(markers).toEqual([]);
    expect(t0).toBe(0);
    expect(t1).toBe(0);
  });
});
