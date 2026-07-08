import { SalesforceLogParser } from '../parser';

describe('SalesforceLogParser', () => {
  it('should parse a basic method entry and exit', () => {
    const parser = new SalesforceLogParser();
    const log = `61.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO
14:22:33.0 (1000000)|EXECUTION_STARTED
14:22:33.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000000|MyClass
14:22:33.0 (3000000)|METHOD_ENTRY|[1]|01p000000000000|MyClass.myMethod()
14:22:33.0 (4000000)|USER_DEBUG|[2]|DEBUG|Hello World
14:22:33.0 (5000000)|METHOD_EXIT|[3]|01p000000000000|MyClass.myMethod()
14:22:33.0 (6000000)|CODE_UNIT_FINISHED|MyClass
14:22:33.0 (7000000)|EXECUTION_FINISHED`;

    parser.parseChunk(log);
    const result = parser.finish();

    expect(result.rawLineCount).toBe(8);
    expect(result.header.version).toBe('61.0');
    expect(result.executionTree).toBeDefined();
    
    // CODE_UNIT_STARTED is the first meaningful entry in the log
    expect(result.executionTree?.type).toBe('SYSTEM');
    expect(result.executionTree?.name).toBe('MyClass');
    expect(result.executionTree?.children.some((child) => child.type === 'METHOD')).toBe(true);
    expect(result.eventLines.length).toBe(7);
  });

  it('should handle exceptions properly', () => {
    const parser = new SalesforceLogParser();
    const log = `14:22:33.0 (1000000)|METHOD_ENTRY|[1]|MyClass.myMethod()
14:22:33.0 (2000000)|EXCEPTION_THROWN|[2]|System.NullPointerException: Attempt to de-reference a null object
14:22:33.0 (3000000)|METHOD_EXIT|[3]|MyClass.myMethod()`;

    parser.parseChunk(log);
    const result = parser.finish();

    expect(result.exceptions.length).toBe(1);
    expect(result.exceptions[0].exceptionType).toBe('EXCEPTION_THROWN');
    expect(result.exceptions[0].message).toBe('System.NullPointerException: Attempt to de-reference a null object');
    expect(result.exceptions[0].parentNodeId).toBe(result.executionTree?.id);
  });
});
