import React from 'react';
import {
  ListTree,
  GanttChartSquare,
  LayoutDashboard,
  BarChart3,
  FileText,
  Bug,
  Network,
  Sparkles,
  Database,
  Save,
  GitBranch,
  ScrollText,
} from 'lucide-react';

export type MainTab =
  | 'explorer'
  | 'rawtree'
  | 'debug'
  | 'timeline'
  | 'tree'
  | 'execution'
  | 'soql'
  | 'dml'
  | 'flow'
  | 'governor'
  | 'summary'
  | 'ai';

interface Props {
  active: MainTab;
  onChange: (tab: MainTab) => void;
  exceptionCount: number;
}

// Same order as Salesforce Log Inspector, then our extras.
const TABS: { id: MainTab; label: string; Icon: typeof ListTree }[] = [
  { id: 'explorer', label: 'Log Explorer', Icon: FileText },
  { id: 'rawtree', label: 'Raw Tree', Icon: Network },
  { id: 'debug', label: 'Apex Debug', Icon: Bug },
  { id: 'timeline', label: 'Execution Timeline', Icon: GanttChartSquare },
  { id: 'tree', label: 'Execution Tree', Icon: ListTree },
  { id: 'execution', label: 'Execution Analysis', Icon: BarChart3 },
  { id: 'soql', label: 'SOQL Analysis', Icon: Database },
  { id: 'dml', label: 'DML Analysis', Icon: Save },
  { id: 'flow', label: 'Flow Analysis', Icon: GitBranch },
  { id: 'governor', label: 'Governor', Icon: LayoutDashboard },
  { id: 'summary', label: 'Summary', Icon: ScrollText },
  { id: 'ai', label: 'AI', Icon: Sparkles },
];

export const TabBar = ({ active, onChange }: Props) => {
  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background px-2">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-sm font-medium transition-colors ${
            active === id
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
};
