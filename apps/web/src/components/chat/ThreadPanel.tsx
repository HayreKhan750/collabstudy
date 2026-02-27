'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import { Message, MentionUser } from '@/lib/api';
import MentionInput from './MentionInput';
import { renderMessageContent } from '@/lib/renderMessageContent';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ThreadPanelProps {
  parentMessage: Message;
  /** The channel ID (for channel threads) OR the DM conversationId (for DM threads). */
  channelId: string;
  onClose: () => void;
  workspaceMembers?: MentionUser[];
  newReply?: Message | null;
  /** When true, the thread is inside a DM conversation — use /direct endpoints. */
  isDm?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function resolveUser(msg: any): { fullName?: string | null; username: string } {
  // DM messages returned from /direct/:id/messages use `sender`, not `user`
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

export default function ThreadPanel({ parentMessage, channelId, onClose, workspaceMembers = [], newReply, isDm = false }: ThreadPanelProps) {
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
      if (isDm) {
        // DM threads: fetch DM messages filtered by parentId
        const res = await fetch(
          `${API_URL}/direct/${channelId}/messages?limit=100&parentId=${parentMessage.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error('Failed to fetch DM thread replies');
        const data = await res.json();
        setReplies(data.messages ?? []);
      } else {
        // Channel threads: use the channel messages endpoint with parentId
        const res = await fetch(
          `${API_URL}/channels/${channelId}/messages?limit=100&parentId=${parentMessage.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error('Failed to fetch messages');
        const data = await res.json();
        setReplies(data.messages ?? []);
      }
    } catch (err) {
      console.error('[Thread] Failed to fetch replies:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId, token, parentMessage.id, isDm]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  // ─── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  // ─── Handle externally-pushed replies (from ChatArea's socket) ───────────

  useEffect(() => {
    if (!newReply) return;
    if (newReply.parentId !== parentMessage.id) return;
    setReplies((prev) => {
      if (prev.some((r) => r.id === newReply.id)) return prev;
      return [...prev, { ...newReply, reactions: newReply.reactions ?? [] }];
    });
  }, [newReply, parentMessage.id]);

  // ─── Focus input on open ──────────────────────────────────────────────────

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ─── Socket: listen for new replies in this thread ───────────────────────

  useEffect(() => {
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
      if (isDm) {
        socket.emit('join_direct', { conversationId: channelId });
      } else {
        socket.emit('join_channel', { channelId });
      }
    });

    // Channel thread: listen for new_message with parentId matching ours
    socket.on('new_message', (msg: Message) => {
      if (msg.parentId !== parentMessage.id) return;
      setReplies((prev) => {
        if (prev.some((r) => r.id === msg.id)) return prev;
        return [...prev, { ...msg, reactions: msg.reactions ?? [] }];
      });
    });

    // DM thread: listen for new_direct_message with parentId matching ours
    socket.on('new_direct_message', (msg: any) => {
      if (!isDm || msg.parentId !== parentMessage.id) return;
      setReplies((prev) => {
        if (prev.some((r) => r.id === msg.id)) return prev;
        // Normalise DM message shape to Message shape
        const normalised: Message = {
          id: msg.id,
          content: msg.content ?? '',
          channelId: msg.conversationId ?? channelId,
          userId: msg.senderId ?? msg.userId,
          parentId: msg.parentId,
          createdAt: msg.createdAt,
          updatedAt: msg.updatedAt,
          isEdited: msg.isEdited,
          user: msg.sender ?? msg.user,
          reactions: msg.reactions ?? [],
        };
        return [...prev, normalised];
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

    try {
      if (isDm) {
        // Post a DM reply (with parentId so it threads properly)
        const res = await fetch(`${API_URL}/direct/${channelId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content, parentId: parentMessage.id }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || 'Failed to send DM reply');
        }
      } else {
        // Post a channel thread reply
        const res = await fetch(`${API_URL}/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content, parentId: parentMessage.id, mentionIds }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || 'Failed to send reply');
        }
      }
      // The real message arrives via the socket listener above
    } catch (err) {
      console.error('[Thread] Failed to send reply:', err);
      setSendError(err instanceof Error ? err.message : 'Failed to send reply. Please try again.');
      setReplyContent(content);
    } finally {
      setSending(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-80 xl:w-96 flex-shrink-0 bg-gray-900 border-l border-gray-700 flex flex-col h-full z-20">
      {/* PINNED HEADER */}
      <div className="flex-shrink-0 border-b border-gray-700 p-4 flex justify-between items-center bg-gray-900">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="font-bold text-white">Thread</h3>
          {isDm && <span className="text-xs text-slate-400 ml-1">(DM)</span>}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          aria-label="Close thread"
        >
          ✕
        </button>
      </div>

      {/* SCROLLABLE AREA: Parent message + replies */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
        {/* Parent Message */}
        <div className="text-sm text-gray-300 bg-gray-800 p-3 rounded mb-2">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
              {getInitial(parentMessage)}
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-white text-sm font-semibold">{getDisplayName(parentMessage)}</span>
                <span className="text-gray-400 text-xs">{formatTime(parentMessage.createdAt)}</span>
              </div>
              <p className="text-gray-300 text-sm break-words">
                {renderMessageContent(parentMessage.content, parentMessage.mentions ?? [])}
              </p>
            </div>
          </div>
        </div>
        <hr className="border-gray-700" />
        <div className="text-xs text-gray-500 pb-1">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </div>
        {loading ? (
          <p className="text-slate-400 dark:text-slate-500 text-xs text-center">Loading replies…</p>
        ) : replies.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-xs text-center">
            No replies yet. Be the first to reply!
          </p>
        ) : (
          replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                {getInitial(reply)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-white text-xs font-semibold">{getDisplayName(reply)}</span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">{formatTime(reply.createdAt)}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-sm break-words">
                  {renderMessageContent(reply.content ?? '', (reply as any).mentions ?? [])}
                </p>

                {/* Reactions on replies */}
                {(reply.reactions?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(
                      reply.reactions.reduce<Record<string, number>>((acc, r) => {
                        acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                        return acc;
                      }, {}),
                    ).map(([emoji, count]) => (
                      <span
                        key={emoji}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                      >
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

      {/* PINNED INPUT */}
      <div className="flex-shrink-0 border-t border-gray-700 p-4 bg-gray-900">
        {sendError && (
          <p className="text-red-400 text-xs mb-1">{sendError}</p>
        )}
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
  );
}
