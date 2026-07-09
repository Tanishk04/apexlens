import { filterRows, type Column } from '../app/components/VirtualTable';
import { PROVIDERS, getProvider } from '../ai/adapter';
import { PROVIDER_META } from '../ai/models';

interface Row {
  name: string;
  type: string;
  ms: number;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', get: (r) => r.name, filter: true },
  { key: 'type', header: 'Type', get: (r) => r.type, filter: true },
  { key: 'ms', header: 'ms', get: (r) => r.ms },
];

const rows: Row[] = [
  { name: 'CasePanel.queryCase', type: 'METHOD', ms: 75 },
  { name: 'SELECT Id FROM Case', type: 'SOQL', ms: 63 },
  { name: 'CasePanel.buildMetrics', type: 'METHOD', ms: 8 },
];

describe('filterRows (analysis column filters)', () => {
  it('filters case-insensitively per column and ANDs multiple filters', () => {
    expect(filterRows(rows, columns, { name: 'casepanel' })).toHaveLength(2);
    expect(filterRows(rows, columns, { type: 'soql' })).toHaveLength(1);
    expect(filterRows(rows, columns, { name: 'case', type: 'method' })).toHaveLength(2);
    expect(filterRows(rows, columns, { name: 'nomatch' })).toHaveLength(0);
  });

  it('ignores empty/whitespace filters', () => {
    expect(filterRows(rows, columns, {})).toHaveLength(3);
    expect(filterRows(rows, columns, { name: '  ' })).toHaveLength(3);
  });
});

describe('AI provider registry', () => {
  it('puts OpenRouter first and includes all expected providers', () => {
    expect(PROVIDERS[0]!.id).toBe('openrouter');
    expect(PROVIDER_META.map((p) => p.id)).toEqual([
      'openrouter',
      'anthropic',
      'openai',
      'ollama',
      'custom',
    ]);
    expect(PROVIDER_META[0]!.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('getProvider resolves ids and builds custom endpoints', () => {
    expect(getProvider('openrouter')?.id).toBe('openrouter');
    expect(getProvider('anthropic')?.id).toBe('anthropic');
    expect(getProvider('custom')).toBeUndefined(); // no URL
    const custom = getProvider('custom', 'https://my-llm.example.com/v1/');
    expect(custom?.id).toBe('custom');
  });
});
