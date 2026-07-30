import { abortError, isAbortError } from '../app/utils/abortError';

/**
 * A user reported the UI freezing when switching logs quickly. Each parse
 * spawns a Worker, and nothing used to cancel the previous one: both ran to
 * completion and both posted a multi-megabyte parsed tree back, each of which
 * is structured-cloned on the *main* thread. Worse, whichever finished last
 * won — a big first log could land after a small second one and leave the view
 * showing a log the header no longer named.
 *
 * `parseInWorker` itself cannot be imported here: it builds its Worker with
 * `new URL(..., import.meta.url)`, and `import.meta` is a syntax error in the
 * CommonJS output ts-jest compiles to. These cover the abort contract the fix
 * rests on — that callers can tell a superseded parse from a failed one, which
 * is what stops the app reporting an error for a log the user has moved on
 * from, or clearing the spinner out from under the newer parse.
 */
describe('abort signalling for superseded work', () => {
  it('produces a rejection matching what fetch aborts with, so callers test one way', () => {
    const err = abortError();
    expect(err).toBeInstanceOf(DOMException);
    expect(err.name).toBe('AbortError');
  });

  it('carries a caller-supplied message for debugging', () => {
    expect(abortError('Parse superseded by a newer log').message).toMatch(/superseded/i);
  });

  it('recognises its own rejection', () => {
    expect(isAbortError(abortError())).toBe(true);
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
  });

  it('is false for ordinary failures, so real errors are still reported', () => {
    // The distinction the whole fix depends on: a genuine parse failure must
    // still surface, only a superseded one is swallowed.
    expect(isAbortError(new Error('Parser worker failed'))).toBe(false);
    expect(isAbortError(new TypeError('boom'))).toBe(false);
    expect(isAbortError(new DOMException('x', 'NotFoundError'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});
