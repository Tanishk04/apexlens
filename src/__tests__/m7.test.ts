/** @jest-environment jsdom */
import { SalesforceLogParser } from '../parser';
import { analyze } from '../app/utils/analysis';
import { buildAiContext, buildFullPrompt, FULL_LOG_CHAR_LIMIT } from '../ai/context';
import { extractLogId, isSelfMutation } from '../content/debugLogs';

const LOG = [
  '61.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO',
  '10:00:00.0 (1000000)|EXECUTION_STARTED',
  '10:00:00.0 (2000000)|METHOD_ENTRY|[1]|A.run',
  '10:00:00.0 (3000000)|EXCEPTION_THROWN|[5]|System.NullPointerException: boom',
  '10:00:00.0 (4000000)|METHOD_EXIT|[1]|A.run',
  '10:00:00.0 (5000000)|EXECUTION_FINISHED',
].join('\n');

function parsed() {
  const p = new SalesforceLogParser();
  p.parseChunk(LOG);
  return p.finish();
}

describe('buildFullPrompt (full-log AI)', () => {
  it('includes the complete raw log for normal-size logs', () => {
    const log = parsed();
    const prompt = buildFullPrompt(LOG, buildAiContext(log, analyze(log.executionTree)));
    // Raw log lines are present verbatim.
    expect(prompt.user).toContain('EXECUTION_STARTED');
    expect(prompt.user).toContain('System.NullPointerException: boom');
    // Structured summary rides along.
    expect(prompt.user).toContain('"exceptions"');
    expect(prompt.user).not.toContain('log truncated for context');
    expect(prompt.system).toContain('raw debug log');
  });

  it('clips head+tail past the char limit with an explicit marker', () => {
    const log = parsed();
    const filler = 'X'.repeat(FULL_LOG_CHAR_LIMIT + 200_000);
    const huge = LOG + '\n' + filler + '\nTAIL_SENTINEL_LINE';
    const prompt = buildFullPrompt(huge, buildAiContext(log, analyze(log.executionTree)));
    expect(prompt.user).toContain('log truncated for context');
    // Head survives…
    expect(prompt.user).toContain('EXECUTION_STARTED');
    // …and so does the tail.
    expect(prompt.user).toContain('TAIL_SENTINEL_LINE');
    // Prompt stays bounded (well under the raw size).
    expect(prompt.user.length).toBeLessThan(FULL_LOG_CHAR_LIMIT + 100_000);
  });
});

describe('content script log-id extraction', () => {
  it('finds 15/18-char ApexLog ids in hrefs and onclicks', () => {
    expect(extractLogId('/servlet/debug?id=07Lg500000AHo13')).toBe('07Lg500000AHo13');
    expect(extractLogId("openLog('07Lg500000AHo13EAD');")).toBe('07Lg500000AHo13EAD');
    expect(extractLogId('/setup/ui/listApexTraces.apexp')).toBeNull();
    expect(extractLogId('/lightning/r/Account/001g500000AHo13EAD/view')).toBeNull();
    expect(extractLogId(null)).toBeNull();
  });
});

/**
 * injectButtons() appends into the very tree the observer watches, so without a
 * self-mutation guard each insertion re-triggers a full-document querySelectorAll
 * — an unbounded feedback loop on the user's live Salesforce tab.
 */
describe('content script observer self-mutation guard', () => {
  const el = (cls?: string) => {
    const node = document.createElement('button');
    if (cls) node.className = cls;
    return node;
  };
  const record = (added: Node[]) => ({ addedNodes: added }) as unknown as MutationRecord;

  it('ignores a batch that only adds our own Analyze buttons', () => {
    expect(isSelfMutation([record([el('sfda-analyze-btn')])])).toBe(true);
    expect(isSelfMutation([record([el('sfda-analyze-btn'), el('sfda-analyze-btn')])])).toBe(true);
  });

  it('also ignores the entry-point cells we inject', () => {
    // The Type/Class/Method cells go into the same observed tree as the buttons,
    // so they need the same guard or they reintroduce the feedback loop.
    expect(isSelfMutation([record([el('sfda-entry-cell')])])).toBe(true);
    expect(isSelfMutation([record([el('sfda-analyze-btn'), el('sfda-entry-cell')])])).toBe(true);
  });

  it('does not ignore real page mutations', () => {
    expect(isSelfMutation([record([el('slds-table-row')])])).toBe(false);
    expect(isSelfMutation([record([el('sfda-analyze-btn')]), record([el()])])).toBe(false);
    expect(isSelfMutation([record([document.createTextNode('x')])])).toBe(false);
  });

  it('treats an empty batch as self (nothing was added to react to)', () => {
    expect(isSelfMutation([record([])])).toBe(true);
  });
});
