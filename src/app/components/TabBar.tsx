import React from 'react';
import {
  ListTree,
  GanttChartSquare,
  LayoutDashboard,
  BarChart3,
  FileText,
  Logs,
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

// Same order as Salesforce Log Inspector, then our extras. Each tab carries a
// feature color (icon always colored; label follows on the active tab).
const TABS: { id: MainTab; label: string; Icon: typeof ListTree; color: string }[] = [
  { id: 'explorer', label: 'Log Explorer', Icon: FileText, color: 'text-code-unit' },
  { id: 'rawtree', label: 'Raw Tree', Icon: Network, color: 'text-system' },
  { id: 'debug', label: 'Apex Debug', Icon: Logs, color: 'text-debug' },
  { id: 'timeline', label: 'Execution Timeline', Icon: GanttChartSquare, color: 'text-flow' },
  { id: 'tree', label: 'Execution Tree', Icon: ListTree, color: 'text-method' },
  { id: 'execution', label: 'Execution Analysis', Icon: BarChart3, color: 'text-trigger' },
  { id: 'soql', label: 'SOQL Analysis', Icon: Database, color: 'text-soql' },
  { id: 'dml', label: 'DML Analysis', Icon: Save, color: 'text-dml' },
  { id: 'flow', label: 'Flow Analysis', Icon: GitBranch, color: 'text-flow' },
  { id: 'governor', label: 'Governor', Icon: LayoutDashboard, color: 'text-validation' },
  { id: 'summary', label: 'Summary', Icon: ScrollText, color: 'text-workflow' },
  { id: 'ai', label: 'AI', Icon: Sparkles, color: 'text-vf' },
];

export const TabBar = ({ active, onChange }: Props) => {
  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background px-2">
      {TABS.map(({ id, label, Icon, color }) => (
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
          <Icon size={14} className={color} />
          {label}
        </button>
      ))}
    </div>
  );
};
