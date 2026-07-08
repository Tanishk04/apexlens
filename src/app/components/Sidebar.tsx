import React from 'react';
import { ListTree, LayoutDashboard, Settings, FileText } from 'lucide-react';

export const Sidebar = () => {
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center border-r border-zinc-800/60 bg-zinc-950 py-4">
      <div className="mb-4 rounded-lg bg-blue-600/10 p-2 text-blue-500">
        <FileText size={20} />
      </div>

      <nav className="flex flex-col gap-4">
        <button
          type="button"
          className="rounded-lg bg-zinc-800/50 p-2 text-zinc-100 transition-colors hover:bg-zinc-800"
          title="Execution Tree"
        >
          <ListTree size={20} />
        </button>
        <button
          type="button"
          className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
          title="Limits Dashboard"
        >
          <LayoutDashboard size={20} />
        </button>
      </nav>

      <div className="mt-auto">
        <button
          type="button"
          className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>
    </aside>
  );
};
