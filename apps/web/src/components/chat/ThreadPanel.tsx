'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import { Message, MentionUser } from '@/lib/api';
import MentionInput from './MentionInput';
import { renderMessageContent } from '@/lib/renderMessageContent';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ThreadPanelProps {
  parentMessage: Message;
  /** Channel ID (channel threads) OR DM conversationId (DM threads). */
  channelId: string;
  onClose: () => void;
  workspaceMembers?: MentionUser[];
  /**
   * For DM threads: the parent passes new replies via this prop.
   * ThreadPanel does NOT open its own socket in DM mode to avoid mirroring.
   */
  newReply?: Message | null;
  /** When true: use /direct endpoints, no own socket (DirectMessageArea handles WS). */
  isDm?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function resolveUser(msg: any): { fullName?: string | null; username: string } {
  return msg.user ?? msg.sender ?? { username: '?' };
}
function getInitial(msg: any) {
  const u = resolveUser(msg);
  return (u.fullName || u.username || '?').charAt(0).toUpperCase();
}
function getDisplayName(msg: any) {
  const u = resolveUser(msg);
  return u.fullName || u.username || 'Unknown';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ThreadPanel({
  parentMessage,
  channelId,
  onClose,
  workspaceMembers = [],
  newReply,
  isDm = false,
}: ThreadPanelProps) {
  const { token, user } = useAuth();

  const [replies, setReplies] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const repliesEndRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ─── Fetch existing replies ──────────────────────────────────────────────

  const fetchReplies = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const endpoint = isDm
        ? `${API_URL}/direct/${channelId}/messages?limit=100&parentId=${parentMessage.id}`
        : `${API_URL}/channels/${channelId}/messages?limit=100&parentId=${parentMessage.id}`;

      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch replies');
      const data = await res.json();
      setReplies(data.messages ?? []);
    } catch (err) {
      console.error('[Thread] Failed to fetch replies:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId, token, parentMessage.id, isDm]);

  useEffect(() => {
    setReplies([]);
    fetchReplies();
  }, [fetchReplies]);

  // ─── Auto-scroll on new replies ──────────────────────────────────────────

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  // ─── Focus input on open ──────────────────────────────────────────────────

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ─── DM mode: accept replies via prop from DirectMessageArea ─────────────
  // DirectMessageArea's socket already receives new_direct_message and passes
  // thread replies via the newReply prop. We do NOT open our own socket in DM
  // mode to prevent mirroring / duplicate reception of messages.

  useEffect(() => {
    if (!isDm || !newReply) return;
    if (newReply.parentId !== parentMessage.id) return;
    setReplies((prev) => {
      if (prev.some((r) => r.id === newReply.id)) return prev;
      return [...prev, { ...newReply, reactions: newReply.reactions ?? [] }];
    });
  }, [newReply, parentMessage.id, isDm]);

  // ─── Channel mode: own socket for real-time channel thread replies ────────
  // Only active when isDm === false. DM replies come via newReply prop above.

  useEffect(() => {
    if (isDm) return; // DM mode: no own socket
    if (!token || !user?.id) return;

    let connectTimer: ReturnType<typeof setTimeout>;
    const prev = socketRef.current;
    if (prev) { prev.removeAllListeners(); prev.disconnect(); }

    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_channel', { channelId });
    });

    // FIREWALL: only accept replies that belong to THIS thread
    socket.on('new_message', (msg: Message) => {
      if (!msg.parentId || msg.parentId !== parentMessage.id) return;
      setReplies((prev) => {
        if (prev.some((r) => r.id === msg.id)) return prev;
        return [...prev, { ...msg, reactions: msg.reactions ?? [] }];
      });
    });

    connectTimer = setTimeout(() => {
      if (socketRef.current === socket) socket.connect();
    }, 50);

    return () => {
      clearTimeout(connectTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [channelId, token, user?.id, parentMessage.id, isDm]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Send reply ───────────────────────────────────────────────────────────

  const handleSendReply = async (mentionIds: string[]) => {
    if (!replyContent.trim() || !token || sending) return;

    setSending(true);
    setSendError(null);
    const content = replyContent.trim();
    setReplyContent('');

    // Optimistic add for instant feedback
    const optimisticId = `temp-reply-${Date.now()}`;
    const optimisticReply: Message = {
      id: optimisticId,
      content,
      channelId,
      userId: user?.id ?? '',
      parentId: parentMessage.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isEdited: false,
      user: {
        id: user?.id ?? '',
        username: user?.username ?? '',
        fullName: user?.fullName ?? undefined,
        avatar: user?.avatar ?? undefined,
      },
      reactions: [],
    };
    setReplies((prev) => [...prev, optimisticReply]);

    try {
      const endpoint = isDm
        ? `${API_URL}/direct/${channelId}/messages`
        : `${API_URL}/channels/${channelId}/messages`;

      const body = isDm
        ? { content, parentId: parentMessage.id }
        : { content, parentId: parentMessage.id, mentionIds };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Failed to send reply');
      }

      const saved = await res.json();

      // Replace optimistic with real server reply
      setReplies((prev) =>
        prev.map((r) =>
          r.id === optimisticId ? { ...saved, reactions: saved.reactions ?? [] } : r
        )
      );
    } catch (err) {
      console.error('[Thread] Failed to send reply:', err);
      setSendError(err instanceof Error ? err.message : 'Failed to send reply. Please try again.');
      // Remove optimistic and restore input
      setReplies((prev) => prev.filter((r) => r.id !== optimisticId));
      setReplyContent(content);
    } finally {
      setSending(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-80 xl:w-96 flex-shrink-0 bg-white/80 dark:bg-[#131627]/80 backdrop-blur-2xl border-l border-gray-200 dark:border-white/[0.08] shadow-[-4px_0_24px_-10px_rgba(0,0,0,0.5)] flex flex-col h-full z-20 text-gray-900 dark:text-[#F8F9FA]">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-white/70 dark:bg-[#131627]/80 backdrop-blur-md border-b border-gray-200 dark:border-white/[0.08] px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="font-bold text-gray-900 dark:text-white">Thread</h3>
          {isDm && <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">(DM)</span>}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded"
          aria-label="Close thread"
        >
          ✕
        </button>
      </div>

      {/* Scrollable: parent message + replies */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
        {/* Parent Message */}
        <div className="bg-gray-100 dark:bg-[#131627]/60 p-3 rounded-lg border border-gray-200 dark:border-white/[0.08]">
          <div className="flex items-start gap-2">
            {resolveUser(parentMessage).username !== '?' && (parentMessage as any).sender?.avatar || (parentMessage as any).user?.avatar ? (
              <img
                src={(parentMessage as any).user?.avatar || (parentMessage as any).sender?.avatar}
                alt={getDisplayName(parentMessage)}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                {getInitial(parentMessage)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-gray-900 dark:text-white text-sm font-semibold">{getDisplayName(parentMessage)}</span>
                <span className="text-gray-500 dark:text-gray-400 text-xs">{formatTime(parentMessage.createdAt)}</span>
              </div>
              <p className="text-gray-700 dark:text-gray-300 text-sm break-words">
                {renderMessageContent(parentMessage.content, parentMessage.mentions ?? [])}
              </p>
            </div>
          </div>
        </div>

        <hr className="border-gray-200 dark:border-white/[0.08]" />
        <div className="text-xs text-gray-500 dark:text-gray-500 pb-1">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </div>

        {loading ? (
          <p className="text-slate-500 dark:text-slate-400 text-xs text-center py-4">Loading replies…</p>
        ) : replies.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-xs text-center py-4">No replies yet. Be the first to reply!</p>
        ) : (
          replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2">
              {(reply as any).user?.avatar || (reply as any).sender?.avatar ? (
                <img
                  src={(reply as any).user?.avatar || (reply as any).sender?.avatar}
                  alt={getDisplayName(reply)}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                  {getInitial(reply)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-gray-900 dark:text-white text-xs font-semibold">{getDisplayName(reply)}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-xs">{formatTime(reply.createdAt)}</span>
                  {reply.id.startsWith('temp-') && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 italic">Sending…</span>
                  )}
                </div>
                <p className="text-gray-700 dark:text-slate-300 text-sm break-words">
                  {renderMessageContent(reply.content ?? '', (reply as any).mentions ?? [])}
                </p>
                {(reply.reactions?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(
                      reply.reactions.reduce<Record<string, number>>((acc, r) => {
                        acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                        return acc;
                      }, {}),
                    ).map(([emoji, count]) => (
                      <span key={emoji} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300">
                        {emoji} {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={repliesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-black/5 dark:border-white/[0.08] px-4 pb-4 pt-3 bg-white/40 dark:bg-[#131627]/80 backdrop-blur-2xl">
        {sendError && <p className="text-red-500 dark:text-red-400 text-xs mb-1">{sendError}</p>}
        <div className="flex items-end gap-2 bg-white/60 dark:bg-[#131627]/80 border border-gray-200/80 dark:border-white/[0.08] rounded-2xl px-2 py-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-shadow duration-200 focus-within:shadow-[inset_0_1px_3px_rgba(0,0,0,0.06),0_0_0_2px_rgba(139,92,246,0.25)] dark:focus-within:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3),0_0_0_2px_rgba(139,92,246,0.3)]">
        <MentionInput
          value={replyContent}
          onChange={setReplyContent}
          onSend={handleSendReply}
          members={workspaceMembers}
          placeholder="Reply in thread…"
          disabled={sending}
          inputRef={inputRef}
        />
        </div>
      </div>
    </div>
  );
}
