'use client';

import { useState } from 'react';
import { api, Channel } from '@/lib/api';

interface CreateChannelModalProps {
  workspaceId: string;
  token: string;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

export default function CreateChannelModal({
  workspaceId,
  token,
  onClose,
  onCreated,
}: CreateChannelModalProps) {
  const [channelName, setChannelName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = channelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const channel = await api.createChannel(
        workspaceId,
        { name: trimmed },
        token,
      );
      onCreated(channel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white/90 dark:bg-[#12131A]/90 backdrop-blur-2xl border border-white/20 dark:border-white/[0.08] rounded-xl max-w-md w-full p-6 shadow-xl shadow-black/10 dark:shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Channel</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-300 mb-4">
          Channels are where conversations happen. Use lowercase letters, numbers, and hyphens.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="channelName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Channel Name
          </label>
          <div className="flex items-center bg-black/5 dark:bg-black/40 border border-transparent dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] rounded-lg px-3 py-2 focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all duration-300">
            <span className="text-slate-400 mr-1">#</span>
            <input
              id="channelName"
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g. general"
              maxLength={100}
              autoFocus
              required
              className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-sm"
            />
          </div>

          {error && (
            <p className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>
          )}

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-slate-100/80 dark:bg-white/[0.06] hover:bg-slate-200/80 dark:hover:bg-white/[0.10] border border-slate-200/80 dark:border-white/[0.08] rounded-lg transition-all duration-300 ease-out disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !channelName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
