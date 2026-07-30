import type { ParsedDebugLog } from '../../types';
import { abortError as makeAbortError } from './abortError';

export { isAbortError } from './abortError';

/**
 * Parse a raw debug log off the main thread. Falls back to synchronous parsing
 * if Workers are unavailable (e.g. a test environment).
 *
 * `signal` supersedes an in-flight parse. This is not just tidiness: opening a
 * second log before the first finished used to leave both workers running to
 * completion, and *both* results then had to cross the worker boundary — a
 * multi-megabyte parsed tree is structured-cloned back onto the main thread,
 * which is main-thread work no amount of off-thread parsing avoids. Several of
 * those stacking up is a visible freeze. Worse, the last one to finish won, so
 * a big first log could land *after* a small second one and leave the view
 * showing a log the header no longer named. Terminating the superseded worker
 * both stops the wasted CPU and guarantees its result is never delivered.
 */
export function parseLogInWorker(body: string, signal?: AbortSignal): Promise<ParsedDebugLog> {
  if (signal?.aborted) return Promise.reject(abortError());

  if (typeof Worker === 'undefined') {
    // Synchronous fallback. Nothing to terminate, so the signal can only be
    // honoured either side of the (blocking) parse, not during it.
    return import('../../parser').then(({ SalesforceLogParser }) => {
      if (signal?.aborted) throw abortError();
      const parser = new SalesforceLogParser();
      parser.parseChunk(body);
      const result = parser.finish();
      if (signal?.aborted) throw abortError();
      return result;
    });
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../parser.worker.ts', import.meta.url), {
      type: 'module',
    });

    const onAbort = () => {
      worker.terminate();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const done = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };

    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: ParsedDebugLog; error?: string }>) => {
      done();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'Parser worker failed'));
    };
    worker.onerror = (e) => {
      done();
      reject(new Error(e.message || 'Parser worker error'));
    };
    worker.postMessage({ body });
  });
}

function abortError(): DOMException {
  return makeAbortError('Parse superseded by a newer log');
}
