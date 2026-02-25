'use client';

import { Workspace } from '@/lib/api';
import { SidebarTooltip } from './SidebarTooltip';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  onWorkspaceSelect: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  onDiscoverWorkspaces: () => void;
  onRenameWorkspace: () => void;
  onDeleteWorkspace: () => void;
  collapsed: boolean;
  isOwner: boolean;
}

/** Icon: compass / discover */
function CompassIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  );
}

/** Icon: plus */
function PlusIcon({ size = 4 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-${size} w-${size}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

/** Icon: pencil */
function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

/** Icon: trash */
function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

export function WorkspaceSwitcher({
  workspaces,
  selectedWorkspace,
  onWorkspaceSelect,
  onCreateWorkspace,
  onDiscoverWorkspaces,
  onRenameWorkspace,
  onDeleteWorkspace,
  collapsed,
  isOwner,
}: WorkspaceSwitcherProps) {
  // In collapsed mode: show a stack of workspace icon avatars
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-3 border-b border-slate-200 dark:border-white/10">
        {workspaces.slice(0, 5).map((ws) => (
          <SidebarTooltip key={ws.id} label={ws.name}>
            <button
              onClick={() => onWorkspaceSelect(ws)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-200 mx-auto
                ${
                  selectedWorkspace?.id === ws.id
                    ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30 rounded-2xl scale-105'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-violet-500/80 hover:text-white hover:rounded-2xl hover:scale-105'
                }`}
            >
              {ws.name.charAt(0).toUpperCase()}
            </button>
          </SidebarTooltip>
        ))}
        <SidebarTooltip label="Create workspace">
          <button
            onClick={onCreateWorkspace}
            className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 hover:bg-green-500 text-slate-500 dark:text-slate-400 hover:text-white flex items-center justify-center transition-all duration-150 hover:rounded-2xl mx-auto"
          >
            <PlusIcon size={4} />
          </button>
        </SidebarTooltip>
        <SidebarTooltip label="Discover workspaces">
          <button
            onClick={onDiscoverWorkspaces}
            className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 hover:bg-blue-500/80 text-slate-500 dark:text-slate-400 hover:text-white flex items-center justify-center transition-all duration-150 hover:rounded-2xl mx-auto"
          >
            <CompassIcon />
          </button>
        </SidebarTooltip>
      </div>
    );
  }

  // Expanded mode: full workspace selector with dropdown
  return (
    <div className="px-3 pt-4 pb-3 border-b border-slate-200 dark:border-white/10">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em]">
          Workspaces
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onDiscoverWorkspaces}
            title="Discover workspaces"
            className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <CompassIcon />
          </button>
          <button
            onClick={onCreateWorkspace}
            title="Create workspace"
            className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <PlusIcon size={4} />
          </button>
        </div>
      </div>

      {/* Workspace dropdown */}
      <div className="relative">
        <select
          value={selectedWorkspace?.id || ''}
          onChange={(e) => {
            const ws = workspaces.find((w) => w.id === e.target.value);
            if (ws) onWorkspaceSelect(ws);
          }}
          className="w-full bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-violet-500 appearance-none cursor-pointer transition-all duration-200 hover:border-violet-300 dark:hover:border-violet-500/30"
        >
          <option value="" className="bg-white dark:bg-slate-800">
            Select workspace…
          </option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id} className="bg-white dark:bg-slate-800">
              {ws.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Owner actions */}
      {isOwner && selectedWorkspace && (
        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={onRenameWorkspace}
            className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <PencilIcon /> Rename
          </button>
          <button
            onClick={onDeleteWorkspace}
            className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <TrashIcon /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
