/// <reference lib="webworker" />
import { SalesforceLogParser } from './parser';

const CHUNK_SIZE = 1 << 20; // 1 MB — keep memory bounded on large logs

self.onmessage = (e: MessageEvent<{ body: string }>) => {
  const { body } = e.data;
  try {
    const parser = new SalesforceLogParser();
    for (let i = 0; i < body.length; i += CHUNK_SIZE) {
      parser.parseChunk(body.slice(i, i + CHUNK_SIZE));
    }
    const result = parser.finish();
    (self as unknown as Worker).postMessage({ ok: true, result });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ ok: false, error });
  }
};
