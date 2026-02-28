'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { MediaViewer } from '@/components/media/MediaViewer';
import { type Socket } from 'socket.io-client';

interface SavedMessage {
  id: string;
  content: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  originalName?: string | null;
  createdAt: string;
  updatedAt: string;
  isEdited?: boolean;
  senderId: string;
  conversationId: string;
  sender: {
    id: string;
    username: string;
    fullName?: string | null;
    avatar?: string | null;
  };
  forwardedFrom?: {
    id: string;
    content: string | null;
    sender?: { id: string; username: string; fullName: string | null };
  } | null;
}

interface SavedMessagesAreaProps {
  onBack?: () => void;
  socket?: Socket | null;
}

function BookmarkIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6.75 3A2.25 2.25 0 0 0 4.5 5.25v15.75l7.5-4.5 7.5 4.5V5.25A2.25 2.25 0 0 0 17.25 3H6.75Z" />
    </svg>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateDivider(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getDateKey(iso: string) {
  return new Date(iso).toDateString();
}

export default function SavedMessagesArea({ onBack, socket }: SavedMessagesAreaProps) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [mediaViewer, setMediaViewer] = useState<{ src: string; mimeType: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load messages + store conversationId ─────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.getSavedMessages(token, 50);
      setMessages(data.messages);
      setNextCursor(data.nextCursor);
      setConversationId(data.conversationId);
    } catch (e) {
      setError('Failed to load saved messages');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WebSocket: join room + real-time listeners ────────────────────────────
  useEffect(() => {
    if (!socket || !conversationId) return;

    // Join the DM room for this saved-messages conversation
    socket.emit('join_direct', { conversationId });

    const handleNewMessage = (msg: SavedMessage) => {
      // Guard: only handle messages from this conversation
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) => {
        // Deduplicate — the optimistic add in handleSend already added it
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    const handleMessageUpdated = (updated: SavedMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
      );
    };

    const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };

    socket.on('new_direct_message', handleNewMessage);
    socket.on('dm_message_updated', handleMessageUpdated);
    socket.on('dm_message_deleted', handleMessageDeleted);

    return () => {
      socket.emit('leave_direct', { conversationId });
      socket.off('new_direct_message', handleNewMessage);
      socket.off('dm_message_updated', handleMessageUpdated);
      socket.off('dm_message_deleted', handleMessageDeleted);
    };
  }, [socket, conversationId]);

  // ── Load more (older messages) ────────────────────────────────────────────
  const loadMore = async () => {
    if (!token || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.getSavedMessages(token, 50, nextCursor);
      setMessages((prev) => [...data.messages, ...prev]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!token || !text.trim() || sending) return;
    const content = text.trim();
    setSending(true);
    setText('');
    try {
      const msg = await api.sendSavedMessage(token, { content });
      // Optimistically add — WebSocket deduplicates on arrival
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e) {
      setError('Failed to save message');
      setText(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!token) return;
    setSending(true);
    try {
      const uploaded = await api.uploadFile(token, file);
      const msg = await api.sendSavedMessage(token, {
        fileUrl: uploaded.url,
        fileType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        originalName: uploaded.originalName,
      });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e) {
      setError('Failed to upload file');
    } finally {
      setSending(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (messageId: string) => {
    if (!token) return;
    // Optimistic remove
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await api.deleteSavedMessage(token, messageId);
    } catch (e) {
      setError('Failed to delete message');
      // Re-fetch to restore state
      loadMessages();
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleEditStart = (msg: SavedMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content ?? '');
  };

  const handleEditSave = async () => {
    if (!token || !editingId || !editText.trim()) return;
    const id = editingId;
    const newContent = editText.trim();
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: newContent, isEdited: true } : m)),
    );
    setEditingId(null);
    setEditText('');
    try {
      await api.editSavedMessage(token, id, newContent);
    } catch (e) {
      setError('Failed to edit message');
      loadMessages(); // Re-fetch to restore
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // ── Attachment rendering ──────────────────────────────────────────────────
  const isImage = (type?: string | null) => type?.startsWith('image/');
  const isVideo = (type?: string | null) => type?.startsWith('video/');
  const isAudio = (type?: string | null) => type?.startsWith('audio/');

  const renderAttachment = (msg: SavedMessage) => {
    if (!msg.fileUrl) return null;
    if (isImage(msg.fileType)) {
      return (
        <button
          onClick={() => setMediaViewer({ src: msg.fileUrl!, mimeType: msg.fileType!, name: msg.originalName ?? 'image' })}
          className="mt-1 block max-w-xs rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 hover:opacity-90 transition-opacity"
        >
          <img src={msg.fileUrl} alt={msg.originalName ?? 'image'} className="max-h-64 object-cover" />
        </button>
      );
    }
    if (isVideo(msg.fileType)) {
      return (
        <video
          src={msg.fileUrl}
          controls
          className="mt-1 max-w-xs rounded-xl border border-slate-200 dark:border-white/10"
        />
      );
    }
    if (isAudio(msg.fileType)) {
      return <audio src={msg.fileUrl} controls className="mt-1 w-full max-w-xs" />;
    }
    return (
      <a
        href={msg.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 flex items-center gap-2 text-sm text-indigo-500 dark:text-indigo-400 hover:underline"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        {msg.originalName ?? 'Download file'}
      </a>
    );
  };

  // ── Group messages by date ────────────────────────────────────────────────
  const grouped: { dateKey: string; label: string; messages: SavedMessage[] }[] = [];
  for (const msg of messages) {
    const key = getDateKey(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (!last || last.dateKey !== key) {
      grouped.push({ dateKey: key, label: formatDateDivider(msg.createdAt), messages: [msg] });
    } else {
      last.messages.push(msg);
    }
  }

  return (
    <div
      className="flex flex-col h-full bg-white dark:bg-slate-900"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 flex-shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0 shadow-md shadow-indigo-500/30">
          <BookmarkIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Saved Messages</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Your private cloud storage</p>
        </div>
      </div>

      {/* ── Message list ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="max-w-3xl mx-auto w-full px-4 space-y-1">
        {nextCursor && (
          <div className="flex justify-center mb-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-600 border-t-indigo-500 rounded-full animate-spin mr-2" />
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center">
              <BookmarkIcon className="h-8 w-8 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-white mb-1">Your Private Cloud</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                Save messages, notes, links, and files here. Only you can see this space.
              </p>
            </div>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.dateKey}>
              {/* Date divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 px-2">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
              </div>

              {group.messages.map((msg) => (
                <div key={msg.id} className="group flex items-start gap-2 py-0.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.03] px-1 transition-colors">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mt-0.5">
                    {user?.fullName?.charAt(0).toUpperCase() ?? user?.username?.charAt(0).toUpperCase() ?? 'Y'}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Forwarded banner */}
                    {msg.forwardedFrom && (
                      <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 border-l-2 border-indigo-400 pl-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        <span>Forwarded from <strong>{msg.forwardedFrom.sender?.username ?? 'unknown'}</strong></span>
                      </div>
                    )}

                    {/* Content or edit form */}
                    {editingId === msg.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                            if (e.key === 'Escape') { setEditingId(null); setEditText(''); }
                          }}
                          className="w-full bg-slate-100 dark:bg-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button onClick={handleEditSave} className="px-3 py-1 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors">Save</button>
                          <button onClick={() => { setEditingId(null); setEditText(''); }} className="px-3 py-1 text-xs bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-white/20 transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap">
                        {msg.content ? renderMessageContent(msg.content, []) : null}
                        {msg.isEdited && (
                          <span className="text-[10px] text-slate-400 ml-1">(edited)</span>
                        )}
                      </div>
                    )}

                    {renderAttachment(msg)}

                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{formatTime(msg.createdAt)}</p>
                  </div>

                  {/* Actions — visible on hover */}
                  {editingId !== msg.id && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0 mt-0.5 transition-opacity">
                      {msg.content && (
                        <button
                          onClick={() => handleEditStart(msg)}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}

        {error && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-red-500 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50">
            {error}
            <button onClick={() => setError(null)} className="ml-3 font-bold">✕</button>
          </div>
        )}

        <div ref={bottomRef} />
        </div>{/* end max-w-3xl */}
      </div>

      {/* ── Input area ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-end gap-2 bg-slate-100 dark:bg-white/5 rounded-2xl px-3 py-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors flex-shrink-0 mb-0.5"
            title="Attach file"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Save a note, link, or reminder…"
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none max-h-32 leading-relaxed"
            style={{ overflowY: text.split('\n').length > 4 ? 'auto' : 'hidden' }}
          />

          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="p-1.5 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 mb-0.5"
            title="Save"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1.5">
          Only visible to you · Drop files to attach
        </p>
        </div>{/* end max-w-3xl */}
      </div>

      {/* ── Media viewer ───────────────────────────────────────────────────── */}
      {mediaViewer && (
        <MediaViewer
          src={mediaViewer.src}
          mimeType={mediaViewer.mimeType}
          name={mediaViewer.name}
          onClose={() => setMediaViewer(null)}
        />
      )}
    </div>
  );
}
