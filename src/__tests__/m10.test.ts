import { SalesforceLogParser } from '../parser';
import { analyze } from '../app/utils/analysis';
import { buildAiContext, buildFullPrompt, buildPrompt, AI_SYSTEM_PROMPT } from '../ai/context';

const LOG = [
  '61.0 APEX_CODE,FINEST;APEX_PROFILING,INFO',
  '10:00:00.0 (1000000)|EXECUTION_STARTED',
  '10:00:00.0 (2000000)|METHOD_ENTRY|[1]|A.run',
  '10:00:00.0 (4000000)|METHOD_EXIT|[1]|A.run',
  '10:00:00.0 (5000000)|EXECUTION_FINISHED',
].join('\n');

function ctx() {
  const p = new SalesforceLogParser();
  p.parseChunk(LOG);
  const parsed = p.finish();
  return buildAiContext(parsed, analyze(parsed.executionTree));
}

describe('AI system prompt guardrails', () => {
  it('instructs the model to report only what the log shows and skip healthy logs', () => {
    expect(AI_SYSTEM_PROMPT).toMatch(/No issues found/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/NEVER output code|no fenced code blocks/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/Never speculate|do not invent hypothetical/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/≥50%/);
  });

  it('full and summary prompts both carry the guardrail system prompt', () => {
    const full = buildFullPrompt(LOG, ctx());
    const summary = buildPrompt(ctx());
    expect(full.system).toBe(AI_SYSTEM_PROMPT);
    expect(summary.system).toBe(AI_SYSTEM_PROMPT);
  });

  it('user message pins the section skeleton for consistent output', () => {
    const { user } = buildFullPrompt(LOG, ctx());
    expect(user).toContain('## Verdict');
    expect(user).toContain('## Recommended fixes');
    expect(user).toMatch(/OMIT any section/i);
    // Still includes the raw log for full analysis.
    expect(user).toContain('EXECUTION_STARTED');
  });
});
