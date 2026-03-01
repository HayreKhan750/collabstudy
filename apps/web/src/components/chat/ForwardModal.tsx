'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface SingleMessage {
  id: string;
  content: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  originalName?: string | null;
}

interface ForwardModalProps {
  messages: SingleMessage[];
  workspaces: { id: string; name: string }[];
  onClose: () => void;
  onForwarded?: () => void;
}

interface ChannelItem {
  id: string;
  name: string;
  workspaceName: string;
}

interface DmItem {
  id: string;
  name: string;
  avatar?: string | null;
}

function BookmarkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6.75 3A2.25 2.25 0 0 0 4.5 5.25v15.75l7.5-4.5 7.5 4.5V5.25A2.25 2.25 0 0 0 17.25 3H6.75Z" />
    </svg>
  );
}

export default function ForwardModal({ messages, workspaces, onClose, onForwarded }: ForwardModalProps) {
  const { token } = useAuth();
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [dms, setDms] = useState<DmItem[]>([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setChannels([]);
    setDms([]);
    setSent(null);
    setSending(null);
    setError(null);
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load channels from all workspaces
        const allChannels: ChannelItem[] = [];
        for (const ws of workspaces) {
          const res = await fetch(`${API_URL}/channels?workspaceId=${ws.id}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          if (res.ok) {
            const data = await res.json();
            const chs: any[] = Array.isArray(data) ? data : data.channels ?? [];
            for (const ch of chs) {
              allChannels.push({ id: ch.id, name: ch.name, workspaceName: ws.name });
            }
          }
        }
        setChannels(allChannels);

        // Load DM conversations
        const dmRes = await fetch(`${API_URL}/direct`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (dmRes.ok) {
          const dmData = await dmRes.json();
          const conversations: any[] = Array.isArray(dmData) ? dmData : dmData.conversations ?? [];
          const dmItems: DmItem[] = conversations.map((conv: any) => {
            const other = conv.participants?.find((p: any) => p.user)?.user;
            return {
              id: conv.id,
              name: other?.fullName || other?.username || 'DM',
              avatar: other?.avatar ?? null,
            };
          });
          setDms(dmItems);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setError('Failed to load destinations. Please try again.');
          console.error('ForwardModal load error:', err);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [token, workspaces]);

  const forwardToSavedMessages = async () => {
    if (!token || sending) return;
    setSending('saved-messages');
    try {
      for (const message of messages) {
        const res = await fetch(`${API_URL}/direct/saved-messages/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            content: message.content || undefined,
            fileUrl: message.fileUrl || undefined,
            fileType: message.fileType || undefined,
            fileSize: message.fileSize || undefined,
            originalName: message.originalName || undefined,
            forwardedFromId: message.id,
          }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
      }
      setSent('saved-messages');
      setTimeout(() => { onForwarded?.(); onClose(); }, 800);
    } catch (err) {
      console.error('Forward to saved messages failed:', err);
      setError('Failed to forward. Please try again.');
    } finally {
      setSending(null);
    }
  };

  const forwardToChannel = async (channelId: string) => {
    if (!token || sending) return;
    setSending(channelId);
    try {
      for (const message of messages) {
        const res = await fetch(`${API_URL}/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            content: message.content || undefined,
            fileUrl: message.fileUrl || undefined,
            fileType: message.fileType || undefined,
            fileSize: message.fileSize || undefined,
            originalName: message.originalName || undefined,
            forwardedFromId: message.id,
          }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
      }
      setSent(channelId);
      setTimeout(() => { onForwarded?.(); onClose(); }, 800);
    } catch (err) {
      console.error('Forward to channel failed:', err);
      setError('Failed to forward. Please try again.');
    } finally {
      setSending(null);
    }
  };

  const forwardToDm = async (conversationId: string) => {
    if (!token || sending) return;
    setSending(conversationId);
    try {
      for (const message of messages) {
        const res = await fetch(`${API_URL}/direct/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            content: message.content || undefined,
            fileUrl: message.fileUrl || undefined,
            fileType: message.fileType || undefined,
            fileSize: message.fileSize || undefined,
            originalName: message.originalName || undefined,
            forwardedFromId: message.id,
          }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
      }
      setSent(conversationId);
      setTimeout(() => { onForwarded?.(); onClose(); }, 800);
    } catch (err) {
      console.error('Forward to DM failed:', err);
      setError('Failed to forward. Please try again.');
    } finally {
      setSending(null);
    }
  };

  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(search.toLowerCase()) ||
    ch.workspaceName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDms = dms.filter(dm =>
    dm.name.toLowerCase().includes(search.toLowerCase())
  );

  // "Saved Messages" always shows unless search doesn't match
  const showSavedMessages = 'saved messages'.includes(search.toLowerCase()) || search === '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900/95 backdrop-blur-2xl border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Forward Message</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            ✕
          </button>
        </div>

        {/* Message preview */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-white/10">
          <p className="text-xs text-slate-500 dark:text-slate-300 mb-1">
            Forwarding {messages.length > 1 ? `${messages.length} messages` : ''}:
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
            {messages[0]?.content ?? (messages[0]?.originalName ? `[File: ${messages[0].originalName}]` : '[No content]')}
            {messages.length > 1 && <span className="text-slate-400"> +{messages.length - 1} more</span>}
          </p>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
          <input
            type="text"
            placeholder="Search channels or DMs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-black/5 dark:bg-black/40 border border-transparent dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300"
            autoFocus
          />
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-2 text-sm text-red-400 bg-red-50 dark:bg-red-900/20">{error}</div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Loading…</div>
          ) : (
            <>
              {/* ── Saved Messages — always pinned at top ─────────────────── */}
              {showSavedMessages && (
                <div>
                  <p className="px-5 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Save</p>
                  <button
                    onClick={forwardToSavedMessages}
                    disabled={!!sending || !!sent}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left disabled:opacity-60"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400 flex-shrink-0">
                      <BookmarkIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Saved Messages</p>
                      <p className="text-xs text-slate-400">Your private cloud</p>
                    </div>
                    {sent === 'saved-messages' ? (
                      <span className="text-green-500 text-xs font-medium">Saved ✓</span>
                    ) : sending === 'saved-messages' ? (
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    ) : null}
                  </button>
                </div>
              )}

              {filteredChannels.length > 0 && (
                <div>
                  <p className="px-5 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Channels</p>
                  {filteredChannels.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => forwardToChannel(ch.id)}
                      disabled={!!sending || !!sent}
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left disabled:opacity-60"
                    >
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm flex-shrink-0">#</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{ch.name}</p>
                        <p className="text-xs text-slate-400 truncate">{ch.workspaceName}</p>
                      </div>
                      {sent === ch.id ? <span className="text-green-500 text-xs font-medium">Sent ✓</span>
                        : sending === ch.id ? <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> : null}
                    </button>
                  ))}
                </div>
              )}

              {filteredDms.length > 0 && (
                <div>
                  <p className="px-5 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Direct Messages</p>
                  {filteredDms.map(dm => (
                    <button
                      key={dm.id}
                      onClick={() => forwardToDm(dm.id)}
                      disabled={!!sending || !!sent}
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left disabled:opacity-60"
                    >
                      {dm.avatar ? (
                        <img src={dm.avatar} alt={dm.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-sm flex-shrink-0">
                          {dm.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate flex-1">{dm.name}</p>
                      {sent === dm.id ? <span className="text-green-500 text-xs font-medium">Sent ✓</span>
                        : sending === dm.id ? <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> : null}
                    </button>
                  ))}
                </div>
              )}

              {!showSavedMessages && filteredChannels.length === 0 && filteredDms.length === 0 && (
                <div className="flex items-center justify-center py-8 text-slate-400 text-sm">No results found</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
