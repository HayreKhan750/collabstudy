'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import { Message, MentionUser } from '@/lib/api';
import MentionInput from './MentionInput';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

import { API_URL } from '@/lib/api';

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

  // ─── Edit state ───────────────────────────────────────────────────────────
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ─── Delete confirm modal state ───────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{ replyId: string } | null>(null);

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
  // 
  // IMPORTANT: For DM threads, edit/delete events come from DirectMessageArea's
  // socket listeners (dm_message_updated, dm_message_deleted), which will trigger
  // a re-render of the entire DM view including the thread panel. The thread panel
  // refetches its replies when the parentMessage changes, so we don't need separate
  // socket listeners here for DM mode.

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

    // ── message_updated ─────────────────────────────────────────────────────
    socket.on('message_updated', (updated: Message) => {
      setReplies((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? { ...r, content: updated.content, isEdited: true, updatedAt: updated.updatedAt }
            : r
        )
      );
    });

    // ── message_deleted ─────────────────────────────────────────────────────
    socket.on('message_deleted', ({ messageId }: { messageId: string }) => {
      setReplies((prev) => prev.filter((r) => r.id !== messageId));
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

  // ─── Edit reply handlers ──────────────────────────────────────────────────

  const handleStartEdit = (reply: Message) => {
    setEditingReplyId(reply.id);
    setEditContent(reply.content ?? '');
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingReplyId(null);
    setEditContent('');
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!token || !editingReplyId || !editContent.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      if (isDm) {
        await fetch(`${API_URL}/direct/${channelId}/messages/${editingReplyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content: editContent.trim() }),
        });
      } else {
        await fetch(`${API_URL}/channels/${channelId}/messages/${editingReplyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content: editContent.trim() }),
        });
      }
      // The real update arrives via socket message_updated
      setEditingReplyId(null);
      setEditContent('');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save edit');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Delete reply handler ─────────────────────────────────────────────────

  const handleDeleteReply = async (replyId: string) => {
    if (!token) return;
    setDeleteConfirm({ replyId });
  };

  const confirmDeleteReply = async () => {
    if (!token || !deleteConfirm) return;
    const { replyId } = deleteConfirm;
    setDeleteConfirm(null);
    
    // Optimistic delete
    setReplies((prev) => prev.filter((r) => r.id !== replyId));

    try {
      if (isDm) {
        await fetch(`${API_URL}/direct/${channelId}/messages/${replyId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await fetch(`${API_URL}/channels/${channelId}/messages/${replyId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      // The deletion propagates via socket message_deleted
    } catch (err) {
      console.error('[Thread] Failed to delete reply:', err);
      // Rollback on error - refetch replies
      fetchReplies();
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-80 xl:w-96 flex-shrink-0 bg-white/80 backdrop-blur-lg dark:bg-[#131627]/80 dark:backdrop-blur-2xl border-l border-slate-200/50 dark:border-white/[0.08] shadow-[-1px_0_12px_-4px_rgba(0,0,0,0.08)] dark:shadow-[-4px_0_24px_-10px_rgba(0,0,0,0.5)] flex flex-col h-full z-20 text-gray-900 dark:text-[#F8F9FA]">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-white/70 backdrop-blur-md dark:bg-[#131627]/80 border-b border-slate-200/60 dark:border-white/[0.08] px-4 py-3 flex justify-between items-center">
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
        <div className="bg-white/70 dark:bg-[#131627]/60 p-3 rounded-xl border border-slate-200/60 dark:border-white/[0.08] shadow-sm">
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
          replies.map((reply) => {
            const isOwnReply = reply.userId === user?.id;
            const isEditing = editingReplyId === reply.id;

            return (
              <div key={reply.id} className="group/reply flex items-start gap-2 relative">
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

                  {/* Edit mode */}
                  {isEditing ? (
                    <div className="flex flex-col gap-1 mt-1">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveEdit();
                          }
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-blue-500/60 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        rows={2}
                        autoFocus
                        disabled={editSaving}
                      />
                      {editError && <p className="text-xs text-red-400">{editError}</p>}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleSaveEdit}
                          disabled={editSaving}
                          className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs disabled:opacity-50"
                        >
                          {editSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-xs"
                        >
                          Cancel
                        </button>
                        <span className="text-[10px] text-slate-400 ml-1">
                          Press <kbd className="px-1 bg-slate-200 dark:bg-slate-700 rounded">Enter</kbd> to save
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-700 dark:text-slate-300 text-sm break-words">
                        {renderMessageContent(reply.content ?? '', (reply as any).mentions ?? [])}
                      </p>
                      {reply.isEdited && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 select-none">edited</span>
                      )}
                    </>
                  )}

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

                {/* Action buttons (Edit/Delete) - only show for own replies */}
                {isOwnReply && !isEditing && !reply.id.startsWith('temp-') && (
                  <div className="absolute -top-2 right-0 opacity-0 group-hover/reply:opacity-100 transition-opacity flex items-center gap-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-1 py-0.5">
                    <button
                      onClick={() => handleStartEdit(reply)}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                      title="Edit reply"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteReply(reply.id)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                      title="Delete reply"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={repliesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 px-4 pb-4 pt-3 bg-transparent">
        {sendError && <p className="text-red-500 dark:text-red-400 text-xs mb-1">{sendError}</p>}
        <div className="bg-white/60 dark:bg-gray-800/50 border border-gray-200/80 dark:border-white/[0.06] rounded-2xl px-2 py-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-shadow duration-200 focus-within:shadow-[inset_0_1px_3px_rgba(0,0,0,0.06),0_0_0_2px_rgba(139,92,246,0.25)] dark:focus-within:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3),0_0_0_2px_rgba(139,92,246,0.3)]">
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

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Reply"
        message="Are you sure you want to delete this reply? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger={true}
        onConfirm={confirmDeleteReply}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
