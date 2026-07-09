/** Shared in-app Find state passed to searchable views. */
export interface FindState {
  query: string;
  caseSensitive: boolean;
  /** Index of the active match (0-based, wraps). */
  index: number;
}

/** Row indexes (into the view's row list) that contain the query. */
export function computeMatches(
  rows: readonly string[],
  query: string,
  caseSensitive: boolean,
): number[] {
  const q = caseSensitive ? query : query.toLowerCase();
  if (!q) return [];
  const matches: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const hay = caseSensitive ? rows[i]! : rows[i]!.toLowerCase();
    if (hay.includes(q)) matches.push(i);
  }
  return matches;
}

/**
 * Split `text` into alternating [plain, match, plain, …] segments for
 * highlight rendering. Join of all segments always equals the input.
 */
export function splitByMatch(
  text: string,
  query: string,
  caseSensitive: boolean,
): { text: string; match: boolean }[] {
  if (!query) return [{ text, match: false }];
  const hay = caseSensitive ? text : text.toLowerCase();
  const q = caseSensitive ? query : query.toLowerCase();
  const out: { text: string; match: boolean }[] = [];
  let pos = 0;
  for (;;) {
    const at = hay.indexOf(q, pos);
    if (at === -1) break;
    if (at > pos) out.push({ text: text.slice(pos, at), match: false });
    out.push({ text: text.slice(at, at + q.length), match: true });
    pos = at + q.length;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), match: false });
  return out.length ? out : [{ text, match: false }];
}
