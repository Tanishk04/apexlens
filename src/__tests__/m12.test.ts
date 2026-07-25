import { SalesforceLogParser } from '../parser';
import { analyze } from '../app/utils/analysis';
import {
  buildAiContext,
  buildFullPrompt,
  buildPrompt,
  AI_SYSTEM_PROMPT,
  OUTPUT_FORMAT_OPTIONS,
  DEFAULT_OUTPUT_FORMAT,
  SEND_SCOPE_OPTIONS,
  DEFAULT_SEND_SCOPE,
} from '../ai/context';
import { PROVIDER_META } from '../ai/models';

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

describe('provider availability (M15: ship OpenRouter + Custom only)', () => {
  it('marks openrouter and custom available, others coming-soon', () => {
    const byId = Object.fromEntries(PROVIDER_META.map((p) => [p.id, p.available]));
    expect(byId.openrouter).toBe(true);
    expect(byId.custom).toBe(true);
    expect(byId.anthropic).toBe(false);
    expect(byId.openai).toBe(false);
    expect(byId.ollama).toBe(false);
  });
});

describe('output format presets', () => {
  it('exposes standard/brief/detailed and defaults to standard', () => {
    const ids = OUTPUT_FORMAT_OPTIONS.map((o) => o.id);
    expect(ids).toEqual(['standard', 'brief', 'detailed']);
    expect(DEFAULT_OUTPUT_FORMAT).toBe('standard');
  });

  it('brief format produces a verdict-only instruction, detailed differs from standard', () => {
    const { user: standardUser } = buildFullPrompt(LOG, ctx(), 'standard');
    const { user: briefUser } = buildFullPrompt(LOG, ctx(), 'brief');
    const { user: detailedUser } = buildFullPrompt(LOG, ctx(), 'detailed');
    expect(briefUser).toMatch(/ONLY a "## Verdict" section/i);
    expect(briefUser).not.toContain('## Recommended fixes');
    expect(detailedUser).toContain('## Recommended fixes');
    expect(detailedUser).not.toBe(standardUser);
    expect(briefUser).not.toBe(standardUser);
  });

  it('defaults to standard when no formatId is passed (backward compatible call sites)', () => {
    const { user: defaulted } = buildFullPrompt(LOG, ctx());
    const { user: explicit } = buildFullPrompt(LOG, ctx(), 'standard');
    expect(defaulted).toBe(explicit);
  });

  it('buildPrompt (summary-only path) also accepts a formatId', () => {
    const { user } = buildPrompt(ctx(), 'brief');
    expect(user).toMatch(/ONLY a "## Verdict" section/i);
  });
});

/**
 * PRIVACY.md promises summary-only by default. Before this, App.runAi always
 * called buildFullPrompt and buildPrompt was dead code — the shipped policy and
 * the shipped behaviour disagreed, on logs that routinely carry customer data.
 */
describe('AI send scope', () => {
  const RAW = '10:00:00.0 (1)|USER_DEBUG|[1]|DEBUG|secret-customer-value';

  it('defaults to summary-only', () => {
    expect(DEFAULT_SEND_SCOPE).toBe('summary');
    expect(SEND_SCOPE_OPTIONS.map((o) => o.id)).toEqual(['summary', 'full']);
  });

  it('summary scope never carries the raw log text', () => {
    const prompt = buildPrompt(ctx());
    expect(prompt.user).not.toContain('secret-customer-value');
    expect(prompt.user).not.toContain('Complete raw debug log');
  });

  it('full scope carries the raw log verbatim', () => {
    const prompt = buildFullPrompt(RAW, ctx());
    expect(prompt.user).toContain('secret-customer-value');
    expect(prompt.user).toContain('Complete raw debug log');
  });

  it('both scopes keep the guardrail system prompt', () => {
    expect(buildPrompt(ctx()).system).toBe(AI_SYSTEM_PROMPT);
    expect(buildFullPrompt(RAW, ctx()).system).toBe(AI_SYSTEM_PROMPT);
  });
});

describe('prompt-injection hardening', () => {
  it('instructs the model to treat the log as untrusted data, not instructions', () => {
    expect(AI_SYSTEM_PROMPT).toMatch(/untrusted data/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/ignore previous instructions/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/role markers/i);
  });
});
