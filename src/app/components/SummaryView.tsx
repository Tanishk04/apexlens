import React, { useMemo, useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';
import type { ParsedDebugLog } from '../../types';
import type { Analysis } from '../utils/analysis';
import { toMarkdown, downloadText } from '../utils/exportMarkdown';
import { Markdown } from './Markdown';

interface Props {
  log: ParsedDebugLog | null;
  analysis: Analysis;
}

/** The exportable report, rendered as a tab (replaces the Export button). */
export const SummaryView = ({ log, analysis }: Props) => {
  const [copied, setCopied] = useState(false);
  const md = useMemo(() => (log ? toMarkdown(log, analysis) : ''), [log, analysis]);

  if (!log) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="p-6">
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {copied ? <Check size={13} className="text-soql" /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => downloadText('salesforce-debug-log.md', md)}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Download size={13} /> Download .md
          </button>
        </div>
        <Markdown text={md} />
      </div>
    </div>
  );
};
