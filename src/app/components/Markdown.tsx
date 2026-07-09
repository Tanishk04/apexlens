import React, { useMemo } from 'react';

/**
 * Minimal markdown renderer: headings, bullets, code fences, bold, inline
 * code, blockquotes, and simple pipe tables. No external dependency.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => text.split(/```/), [text]);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground">
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground"
          >
            {block.replace(/^\w+\n/, '')}
          </pre>
        ) : (
          <TextBlock key={i} block={block} />
        ),
      )}
    </div>
  );
}

function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, k) => {
    if (seg.startsWith('**') && seg.endsWith('**'))
      return (
        <strong key={k} className="font-semibold text-foreground">
          {seg.slice(2, -2)}
        </strong>
      );
    if (seg.startsWith('`') && seg.endsWith('`'))
      return (
        <code key={k} className="rounded bg-muted px-1 font-mono text-xs">
          {seg.slice(1, -1)}
        </code>
      );
    return seg;
  });
}

function TextBlock({ block }: { block: string }) {
  const lines = block.split('\n');
  const out: React.ReactNode[] = [];
  let tableRows: string[][] = [];

  const flushTable = (key: number) => {
    if (tableRows.length === 0) return;
    const [header, ...body] = tableRows;
    out.push(
      <div key={`t${key}`} className="overflow-x-auto">
        <table className="my-1 w-full border-collapse text-xs">
          <thead>
            <tr>
              {header!.map((cell, c) => (
                <th
                  key={c}
                  className="border-b border-border px-2 py-1 text-left font-semibold text-muted-foreground"
                >
                  {inline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r} className="border-b border-border/40">
                {row.map((cell, c) => (
                  <td key={c} className="px-2 py-1 font-mono">
                    {inline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = [];
  };

  lines.forEach((line, j) => {
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      // Skip separator rows like | --- | ---: |
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) tableRows.push(cells);
      return;
    }
    flushTable(j);

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      out.push(
        <h3
          key={j}
          className={`mb-1 mt-3 font-semibold text-foreground ${level === 1 ? 'text-base' : 'text-sm'}`}
        >
          {inline(line.replace(/^#{1,3}\s/, ''))}
        </h3>,
      );
    } else if (/^>\s?/.test(line)) {
      out.push(
        <p key={j} className="border-l-2 border-warn/60 pl-3 text-validation">
          {inline(line.replace(/^>\s?/, ''))}
        </p>,
      );
    } else if (/^[-*]\s/.test(line)) {
      out.push(
        <p key={j} className="pl-4">
          <span className="mr-2 text-muted-foreground">•</span>
          {inline(line.replace(/^[-*]\s/, ''))}
        </p>,
      );
    } else if (line.trim() === '') {
      out.push(<div key={j} className="h-1.5" />);
    } else {
      out.push(<p key={j}>{inline(line)}</p>);
    }
  });
  flushTable(lines.length);

  return <div>{out}</div>;
}
