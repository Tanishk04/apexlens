import React, { useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react';

interface Props {
  open: boolean;
  query: string;
  caseSensitive: boolean;
  matchCount: number;
  /** 0-based active match index. */
  index: number;
  supported: boolean;
  onQuery: (q: string) => void;
  onToggleCase: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/** Floating in-app Find overlay (Ctrl/Cmd+F) — Log Inspector style. */
export const FindBar = ({
  open,
  query,
  caseSensitive,
  matchCount,
  index,
  supported,
  onQuery,
  onToggleCase,
  onNext,
  onPrev,
  onClose,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.select());
  }, [open]);

  if (!open) return null;

  const counter = !supported
    ? 'Not searchable here'
    : !query
      ? ''
      : matchCount === 0
        ? 'No results'
        : `${index + 1} of ${matchCount}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="absolute right-4 top-2 z-40 flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find"
        className="w-44 bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
      />
      <button
        type="button"
        onClick={onToggleCase}
        title="Match case"
        className={`rounded p-1 ${
          caseSensitive
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <CaseSensitive size={14} />
      </button>
      <span className="min-w-16 px-1 text-center text-xs text-muted-foreground">{counter}</span>
      <button
        type="button"
        onClick={onPrev}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={matchCount === 0}
        title="Next match (Enter)"
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
};
