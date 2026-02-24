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
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Create Channel</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Channels are where conversations happen. Use lowercase letters, numbers, and hyphens.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="channelName" className="block text-sm font-medium text-gray-300 mb-1">
            Channel Name
          </label>
          <div className="flex items-center bg-gray-700 border border-gray-600 rounded px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <span className="text-gray-400 mr-1">#</span>
            <input
              id="channelName"
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g. general"
              maxLength={100}
              autoFocus
              required
              className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
            />
          </div>

          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !channelName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
