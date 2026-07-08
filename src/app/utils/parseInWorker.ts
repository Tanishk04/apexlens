import type { ParsedDebugLog } from '../../types';

/**
 * Parse a raw debug log off the main thread. Falls back to synchronous parsing
 * if Workers are unavailable (e.g. a test environment).
 */
export function parseLogInWorker(body: string): Promise<ParsedDebugLog> {
  if (typeof Worker === 'undefined') {
    // Synchronous fallback.
    return import('../../parser').then(({ SalesforceLogParser }) => {
      const parser = new SalesforceLogParser();
      parser.parseChunk(body);
      return parser.finish();
    });
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../parser.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: ParsedDebugLog; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'Parser worker failed'));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Parser worker error'));
    };
    worker.postMessage({ body });
  });
}
