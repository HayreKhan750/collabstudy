'use client';

/** Empty state shown when no workspace is selected */
export function NoWorkspaceState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 relative">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-slate-200 dark:border-white/10 flex items-center justify-center">
          <svg className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        </div>
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-indigo-500/40" />
        <div className="absolute -bottom-1 -left-3 w-3 h-3 rounded-full bg-purple-500/40" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Welcome to CollabStudy</h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs leading-relaxed mb-6">
        Create a workspace to start collaborating with your team, or join an existing one.
      </p>
      <button
        onClick={onCreate}
        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white hover:text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
      >
        + Create Workspace
      </button>
    </div>
  );
}

/** Empty state shown when a workspace is selected but no channel is active */
export function NoChannelState({ workspaceName }: { workspaceName: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 relative">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-slate-200 dark:border-white/10 flex items-center justify-center">
          <svg className="h-12 w-12 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
        </div>
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-blue-500/40" />
        <div className="absolute -bottom-1 -left-3 w-3 h-3 rounded-full bg-cyan-500/40" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{workspaceName}</h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs leading-relaxed">
        Select a channel from the sidebar to start chatting, or create a new one to kick things off.
      </p>
    </div>
  );
}
