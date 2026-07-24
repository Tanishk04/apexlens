import type { ParsedDebugLog } from '../../types';
import type { Analysis } from './analysis';

const r1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** Render a shareable Markdown report of the parsed log + analysis. */
export function toMarkdown(log: ParsedDebugLog, analysis: Analysis): string {
  const m = log.metrics;
  const out: string[] = [];

  out.push('# Salesforce Debug Log Report');
  out.push('');
  if (log.truncated) out.push('> ⚠ Log was truncated (maximum debug log size reached).', '');

  out.push('## Summary');
  out.push('');
  out.push('| Metric | Value |');
  out.push('| --- | --- |');
  out.push(`| Duration | ${Math.round(m.durationMs)} ms |`);
  out.push(`| SOQL | ${m.totalSoql} |`);
  out.push(`| DML | ${m.totalDml} (${m.totalDmlRows} rows) |`);
  out.push(`| Methods | ${m.totalMethods} |`);
  out.push(`| Exceptions | ${m.exceptionCount} |`);
  if (m.cpuTimeMs > 0) out.push(`| CPU time | ${m.cpuTimeMs} ms |`);
  out.push('');

  if (log.exceptions.length > 0) {
    out.push('## Exceptions');
    out.push('');
    for (const e of log.exceptions) {
      out.push(`### ${e.exceptionType}${e.lineNumber ? ` (line ${e.lineNumber})` : ''}`);
      out.push('');
      out.push('```');
      out.push(e.message);
      for (const line of e.stackTrace.slice(0, 30)) out.push(line);
      out.push('```');
      out.push('');
    }
  }

  if (log.governorLimits) {
    out.push('## Governor Limits');
    out.push('');
    for (const [ns, list] of Object.entries(log.governorLimits.namespaces)) {
      const used = list.filter((l) => l.used > 0);
      if (used.length === 0) continue;
      out.push(`**Namespace: ${ns || 'default'}**`);
      out.push('');
      out.push('| Limit | Used | Allowed | % |');
      out.push('| --- | ---: | ---: | ---: |');
      for (const l of used) {
        out.push(`| ${l.name} | ${l.used} | ${l.allowed} | ${Math.round(l.percentage * 100)}% |`);
      }
      out.push('');
    }
  }

  const unrecognized = Object.entries(log.unrecognizedEvents ?? {}).sort((a, b) => b[1] - a[1]);
  if (unrecognized.length > 0) {
    out.push('## Unrecognized events');
    out.push('');
    out.push(
      'Events this build could not classify. They still render as GENERIC rows — reporting them ' +
        'as a gap is deliberate, since Salesforce does not publish a complete event catalog.',
    );
    out.push('');
    out.push('| Event | Count |');
    out.push('| --- | ---: |');
    for (const [event, count] of unrecognized.slice(0, 20)) {
      out.push(`| ${event} | ${count} |`);
    }
    out.push('');
  }

  if (analysis.soqlInLoopCount > 0) {
    out.push(`> ⚠ ${analysis.soqlInLoopCount} SOQL quer${
      analysis.soqlInLoopCount === 1 ? 'y' : 'ies'
    } executed in a loop.`);
    out.push('');
  }

  if (analysis.methods.length > 0) {
    out.push('## Slowest (self time)');
    out.push('');
    out.push('| Name | Type | Count | Total ms | Self ms |');
    out.push('| --- | --- | ---: | ---: | ---: |');
    for (const r of analysis.methods.slice(0, 15)) {
      out.push(`| ${r.name} | ${r.type} | ${r.count} | ${r1(r.totalMs)} | ${r1(r.selfMs)} |`);
    }
    out.push('');
  }

  if (analysis.soql.length > 0) {
    out.push('## SOQL');
    out.push('');
    out.push('| Query | Count | Total ms | Max rows | Loop |');
    out.push('| --- | ---: | ---: | ---: | :---: |');
    for (const r of analysis.soql.slice(0, 20)) {
      const q = r.query.replace(/\|/g, '\\|').slice(0, 120);
      out.push(`| ${q} | ${r.count} | ${r1(r.totalMs)} | ${r.maxRows} | ${r.inLoop ? '⚠' : ''} |`);
    }
    out.push('');
  }

  return out.join('\n');
}

/** Trigger a browser download of the given text. */
export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
