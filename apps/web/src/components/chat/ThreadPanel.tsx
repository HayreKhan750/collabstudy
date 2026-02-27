'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import { api, Message, Reaction, MentionUser } from '@/lib/api';
import MentionInput from './MentionInput';
import { renderMessageContent } from '@/lib/renderMessageContent';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ThreadPanelProps {
  parentMessage: Message;
  channelId: string;
  onClose: () => void;
  workspaceMembers?: MentionUser[];
  newReply?: Message | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitial(msg: Message) {
  return (msg.user.fullName || msg.user.username).charAt(0).toUpperCase();
}

function getDisplayName(msg: Message) {
  return msg.user.fullName || msg.user.username;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ThreadPanel({ parentMessage, channelId, onClose, workspaceMembers = [], newReply }: ThreadPanelProps) {
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
      const data = await api.getMessages(channelId, token, 100, undefined, parentMessage.id);
      setReplies(data.messages);
    } catch (err) {
      console.error('[Thread] Failed to fetch replies:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId, token, parentMessage.id]);

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
      socket.emit('join_channel', { channelId });
    });

    // Only capture messages that are replies to our parentMessage
    socket.on('new_message', (msg: Message) => {
      if (msg.parentId !== parentMessage.id) return;
      setReplies((prev) => {
        if (prev.some((r) => r.id === msg.id)) return prev;
        return [...prev, { ...msg, reactions: msg.reactions ?? [] }];
      });
      // Also bump the reply count on the parent in ChatArea (handled by the
      // parent component via re-fetch or socket — no action needed here).
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
  }, [channelId, token, user?.id, parentMessage.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Send reply ───────────────────────────────────────────────────────────

  const handleSendReply = async (mentionIds: string[]) => {
    if (!replyContent.trim() || !token || sending) return;

    setSending(true);
    setSendError(null);
    const content = replyContent;
    setReplyContent('');

    try {
      await api.sendMessage(channelId, content, token, parentMessage.id, mentionIds);
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
    <div className="w-80 xl:w-96 flex-shrink-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col min-h-0">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-white font-semibold text-sm">Thread</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          aria-label="Close thread"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Parent message */}
      <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Original message</p>
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
            {getInitial(parentMessage)}
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-white text-sm font-semibold">{getDisplayName(parentMessage)}</span>
              <span className="text-slate-400 dark:text-slate-500 text-xs">{formatTime(parentMessage.createdAt)}</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-sm break-words">
              {renderMessageContent(parentMessage.content, parentMessage.mentions ?? [])}
            </p>
          </div>
        </div>
      </div>

      {/* Reply count summary */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </span>
      </div>

      {/* Replies list — min-h-0 is required for flex-1 + overflow-y-auto to work correctly inside a flex column */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
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
                  {renderMessageContent(reply.content, reply.mentions ?? [])}
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

      {/* Reply input */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-700">
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
