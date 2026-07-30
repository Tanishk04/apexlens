/**
 * Abort signalling for superseded work, kept separate from `parseInWorker` so
 * it is unit-testable: that module constructs a Worker with
 * `new URL(..., import.meta.url)`, and `import.meta` is a syntax error under
 * the CommonJS output ts-jest compiles to, so the whole file cannot be
 * imported from a test.
 */

/** Matches what `fetch` rejects with when aborted, so callers can test one way. */
export function abortError(message = 'Superseded by a newer request'): DOMException {
  return new DOMException(message, 'AbortError');
}

/**
 * True for an abort rejection. Callers use this to tell "the user moved on"
 * apart from "this genuinely failed" — reporting the former as an error would
 * replace what the user actually asked for with a message about what they
 * abandoned.
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
