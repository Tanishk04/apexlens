import React from 'react';
import { ListTree, LayoutDashboard, BarChart3, FileText } from 'lucide-react';

export type MainTab = 'tree' | 'governor' | 'analysis' | 'raw';

interface Props {
  active: MainTab;
  onChange: (tab: MainTab) => void;
  exceptionCount: number;
}

const TABS: { id: MainTab; label: string; Icon: typeof ListTree }[] = [
  { id: 'tree', label: 'Tree', Icon: ListTree },
  { id: 'governor', label: 'Governor', Icon: LayoutDashboard },
  { id: 'analysis', label: 'Analysis', Icon: BarChart3 },
  { id: 'raw', label: 'Raw', Icon: FileText },
];

export const TabBar = ({ active, onChange }: Props) => {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800/60 bg-zinc-950 px-3">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === id
              ? 'border-blue-500 text-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
};
