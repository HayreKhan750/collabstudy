'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, Channel, DirectConversation } from '@/lib/api';

interface ForwardModalProps {
  messageContent: string;
  messageId: string;
  workspaces: { id: string; name: string }[];
  onClose: () => void;
  onForwarded?: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ForwardModal({ messageContent, workspaces, onClose, onForwarded }: ForwardModalProps) {
  const { token } = useAuth();
  const [channels, setChannels] = useState<(Channel & { workspaceName: string })[]>([]);
  const [dms, setDms] = useState<DirectConversation[]>([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      try {
        // Load channels from all workspaces
        const allChannels: (Channel & { workspaceName: string })[] = [];
        for (const ws of workspaces) {
          const chs = await api.getChannels(token, ws.id);
          for (const ch of chs) {
            allChannels.push({ ...ch, workspaceName: ws.name });
          }
        }
        setChannels(allChannels);

        // Load DM conversations
        const conversations = await api.getDirectConversations(token);
        setDms(conversations);
      } catch (err) {
        console.error('ForwardModal load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, workspaces]);

  const forwardToChannel = async (channelId: string) => {
    if (!token || sending) return;
    setSending(channelId);
    try {
      await api.sendMessage(token, channelId, messageContent);
      setSent(channelId);
      setTimeout(() => { onForwarded?.(); onClose(); }, 800);
    } catch (err) {
      console.error('Forward to channel failed:', err);
    } finally {
      setSending(null);
    }
  };

  const forwardToDm = async (conversationId: string) => {
    if (!token || sending) return;
    setSending(conversationId);
    try {
      const res = await fetch(`${API_URL}/direct/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: messageContent }),
      });
      if (!res.ok) throw new Error('Failed to forward');
      setSent(conversationId);
      setTimeout(() => { onForwarded?.(); onClose(); }, 800);
    } catch (err) {
      console.error('Forward to DM failed:', err);
    } finally {
      setSending(null);
    }
  };

  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(search.toLowerCase()) ||
    ch.workspaceName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDms = dms.filter(dm => {
    const name = dm.participants?.map(p => p.user?.username ?? '').join(', ') ?? '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Forward Message</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message preview */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-white/10">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Forwarding:</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">{messageContent}</p>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
          <input
            type="text"
            placeholder="Search channels or DMs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            autoFocus
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Loading…</div>
          ) : (
            <>
              {filteredChannels.length > 0 && (
                <div>
                  <p className="px-5 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Channels</p>
                  {filteredChannels.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => forwardToChannel(ch.id)}
                      disabled={!!sending || !!sent}
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm flex-shrink-0">
                        #
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{ch.name}</p>
                        <p className="text-xs text-slate-400 truncate">{ch.workspaceName}</p>
                      </div>
                      {sent === ch.id ? (
                        <span className="text-green-500 text-xs font-medium">Sent ✓</span>
                      ) : sending === ch.id ? (
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      ) : null}
                    </button>
                  ))}
                </div>
              )}

              {filteredDms.length > 0 && (
                <div>
                  <p className="px-5 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Direct Messages</p>
                  {filteredDms.map(dm => {
                    const other = dm.participants?.find(p => p.user)?.user;
                    const name = other?.fullName || other?.username || 'DM';
                    return (
                      <button
                        key={dm.id}
                        onClick={() => forwardToDm(dm.id)}
                        disabled={!!sending || !!sent}
                        className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                      >
                        {other?.avatar ? (
                          <img src={other.avatar} alt={name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-sm flex-shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate flex-1">{name}</p>
                        {sent === dm.id ? (
                          <span className="text-green-500 text-xs font-medium">Sent ✓</span>
                        ) : sending === dm.id ? (
                          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredChannels.length === 0 && filteredDms.length === 0 && (
                <div className="flex items-center justify-center py-8 text-slate-400 text-sm">No results found</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
