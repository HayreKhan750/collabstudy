'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, Workspace } from '@/lib/api';

interface DiscoverWorkspacesModalProps {
  token: string;
  onClose: () => void;
  onJoined: (workspace: Workspace) => void;
}

export default function DiscoverWorkspacesModal({
  token,
  onClose,
  onJoined,
}: DiscoverWorkspacesModalProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  const fetchDiscoverable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.discoverWorkspaces(token);
      setWorkspaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDiscoverable();
  }, [fetchDiscoverable]);

  const handleJoin = async (workspaceId: string) => {
    setJoiningId(workspaceId);
    setError(null);
    try {
      const joined = await api.joinWorkspace(token, workspaceId);
      setJoinedIds((prev) => new Set(prev).add(workspaceId));
      onJoined(joined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join workspace');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white dark:bg-gray-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/[0.08] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-800">
          <div className="flex items-center space-x-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-violet-500"
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Discover Workspaces</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all duration-150 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.06] active:scale-95"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-500 dark:text-slate-400">Loading workspaces...</div>
            </div>
          ) : workspaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="text-slate-600 dark:text-slate-400 font-medium">No discoverable workspaces</p>
              <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
                You&apos;re already a member of all public workspaces!
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {workspaces.map((workspace) => {
                const alreadyJoined = joinedIds.has(workspace.id);
                const isJoining = joiningId === workspace.id;
                const memberCount = workspace._count?.members ?? 0;

                return (
                  <li
                    key={workspace.id}
                    className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-white/[0.06] rounded-xl px-4 py-3 transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(139,92,246,0.3)]">
                        <span className="text-white font-bold text-sm uppercase">
                          {workspace.name.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-slate-900 dark:text-white font-medium truncate">{workspace.name}</p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs">
                          {memberCount} {memberCount === 1 ? 'member' : 'members'}
                          {workspace.owner && (
                            <> &middot; by {workspace.owner.fullName || workspace.owner.username}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleJoin(workspace.id)}
                      disabled={isJoining || alreadyJoined}
                      className={`ml-4 flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        alreadyJoined
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default'
                          : 'bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 active:scale-95 text-white disabled:opacity-50 shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:shadow-[0_0_20px_rgba(139,92,246,0.5)]'
                      }`}
                    >
                      {isJoining ? 'Joining...' : alreadyJoined ? '✓ Joined' : 'Join'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all duration-150 active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
