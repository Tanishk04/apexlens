import React from 'react';
import { splitByMatch } from '../utils/find';

interface HighlightedProps {
  text: string;
  query: string;
  caseSensitive: boolean;
  /** Is this row the active find match (bolder highlight) vs. any other match? */
  active: boolean;
  /** Class applied to the non-matching segments. */
  className?: string;
}

/** Wraps `text` with `query` matches in `<mark>`, styled per the shared active/
 * inactive find-highlight convention. Used by Execution Tree, Raw Tree, and
 * Log Explorer — previously each hand-wrote this same `<mark>` JSX. */
export function Highlighted({ text, query, caseSensitive, active, className }: HighlightedProps) {
  if (!query) return <span className={className}>{text}</span>;
  return (
    <>
      {splitByMatch(text, query, caseSensitive).map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className={`rounded-sm px-0 ${
              active ? 'bg-warn text-background' : 'bg-warn/40 text-foreground'
            }`}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i} className={className}>
            {seg.text}
          </span>
        ),
      )}
    </>
  );
}
