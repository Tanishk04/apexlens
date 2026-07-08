import React from 'react';
import type { GovernorLimits, LimitMetric, LogMetrics } from '../../types';

interface Props {
  limits: GovernorLimits | null;
  metrics: LogMetrics;
}

function tone(pct: number): { bar: string; text: string; ring: string } {
  if (pct >= 0.8) return { bar: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/30' };
  if (pct >= 0.5)
    return { bar: 'bg-yellow-500', text: 'text-yellow-400', ring: 'ring-yellow-500/30' };
  return { bar: 'bg-blue-500', text: 'text-zinc-300', ring: 'ring-zinc-700/60' };
}

function LimitCard({ metric }: { metric: LimitMetric }) {
  const pct = Math.min(1, Math.max(0, metric.percentage));
  const t = tone(pct);
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 ring-1 ring-inset ${t.ring}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-zinc-400" title={metric.name}>
          {metric.name}
        </span>
        <span className={`shrink-0 font-mono text-xs ${t.text}`}>{Math.round(pct * 100)}%</span>
      </div>
      <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="font-mono text-[11px] text-zinc-500">
        {metric.used.toLocaleString()} / {metric.allowed.toLocaleString()}
      </div>
    </div>
  );
}

export const GovernorDashboard = ({ limits, metrics }: Props) => {
  const namespaces = limits ? Object.entries(limits.namespaces) : [];

  return (
    <div className="h-full overflow-auto bg-zinc-950 p-5">
      {/* transaction summary strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Duration" value={`${Math.round(metrics.durationMs)} ms`} />
        <Stat label="SOQL" value={metrics.totalSoql} />
        <Stat label="DML" value={metrics.totalDml} />
        <Stat label="DML rows" value={metrics.totalDmlRows} />
        <Stat label="Methods" value={metrics.totalMethods} />
        <Stat
          label="Exceptions"
          value={metrics.exceptionCount}
          danger={metrics.exceptionCount > 0}
        />
      </div>

      {namespaces.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-600">
          No governor-limit data in this log. Enable the <span className="font-mono">APEX_PROFILING</span>{' '}
          category (INFO+) in your trace flags to capture <span className="font-mono">LIMIT_USAGE_FOR_NS</span>.
        </div>
      ) : (
        namespaces.map(([ns, list]) => (
          <section key={ns} className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Namespace: <span className="text-zinc-300">{ns || 'default'}</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {list.map((metric) => (
                <LimitCard key={metric.name} metric={metric} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 font-mono text-lg ${danger ? 'text-red-400' : 'text-zinc-200'}`}>
        {value}
      </div>
    </div>
  );
}
