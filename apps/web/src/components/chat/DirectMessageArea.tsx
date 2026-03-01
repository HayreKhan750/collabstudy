'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import SummaryModal from './SummaryModal';
import ThreadPanel from './ThreadPanel';
import { MessageBubble, MessageData } from './message/MessageBubble';
import { TypingIndicator } from './message/TypingIndicator';
import { UnreadDivider } from './message/UnreadDivider';
import { ScrollToBottomFAB } from './message/ScrollToBottomFAB';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import ForwardModal from './ForwardModal';
import { PinnedMessageBar } from './PinnedMessageBar';
import UserProfileModal from './UserProfileModal';
import CreatePollModal from './CreatePollModal';
import type { Message } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface DMUser {
  id: string;
  username: string;
  fullName: string | null;
  avatar: string | null;
  status?: string;
}

interface DMReaction {
  id: string;
  emoji: string;
  userId: string;
  user?: { id: string; username: string; fullName?: string | null; avatar?: string | null };
}

interface DirectMessage {
  id: string;
  content: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileSize: number | null;
  originalName: string | null;
  senderId: string;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  sender: DMUser;
  reactions?: DMReaction[];
  forwardedFromId?: string | null;
  forwardedFrom?: {
    id: string;
    content: string | null;
    sender?: { id: string; username: string; fullName: string | null };
    user?: { id: string; username: string; fullName: string | null };
  } | null;
}

interface DirectMessageAreaProps {
  conversationId: string;
  onlineUserIds?: Set<string>;
  recipient: DMUser;
  onBack?: () => void;
  /** Called when user clicks the Call button — parent handles WebRTC setup. */
  onStartCall?: (targetUserId: string, targetName: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DirectMessageArea({
  conversationId,
  recipient,
  onBack,
  onStartCall,
  onlineUserIds = new Set(),
}: DirectMessageAreaProps) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState<{
    url: string;
    type: string;
    name: string;
    size: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const summaryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isTypingRef = useRef(false);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Edit state ───────────────────────────────────────────────────────────
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ── Delete confirm state ─────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{ messageId: string } | null>(null);
  const [forwardMessage, setForwardMessage] = useState<DirectMessage | null>(null);
  const [saveToast, setSaveToast] = useState(false);
  const [bulkForwardMessages, setBulkForwardMessages] = useState<any[]>([]);

  // ── Save DM handler (stable callback) ──────────────────────────────────────
  const handleSaveDmMessage = useCallback(
    async (message: DirectMessage) => {
      if (!token) return;
      try {
        await api.sendSavedMessage(token, {
          // Only include content if it is a non-null string
          ...(message.content ? { content: message.content } : {}),
          // Only include file fields if a file exists
          ...(message.fileUrl ? {
            fileUrl: message.fileUrl,
            fileType: message.fileType ?? undefined,
            fileSize: message.fileSize ?? undefined,
            originalName: message.originalName ?? undefined,
          } : {}),
          // Track the source DM message
          forwardedFromId: message.id,
        });
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 2000);
      } catch (e) {
        console.warn('[Save DM] Failed:', e);
      }
    },
    [token]
  );

  // ── Copy toast state ──────────────────────────────────────────────────────
  const [copyToast, setCopyToast] = useState(false);

  // ── Bulk selection state ─────────────────────────────────────────────────
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // ── Inline reply state ───────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);

  // ── Pinned message state ─────────────────────────────────────────────────
  const [pinnedMessage, setPinnedMessage] = useState<DirectMessage | null>(null);
  const [showPinnedBar, setShowPinnedBar] = useState(true);

  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  }, []);

  // ── Thread state ─────────────────────────────────────────────────────────
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [pendingThreadReply, setPendingThreadReply] = useState<Message | null>(null);

  // ── AI Summary modal state ───────────────────────────────────────────────
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);

  // ── Clear History state ──────────────────────────────────────────────────
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [profileUser, setProfileUser] = useState<{ id: string; username: string; fullName: string | null; avatar: string | null } | null>(null);

  // ── Poll Modal state ─────────────────────────────────────────────────────
  const [showPollModal, setShowPollModal] = useState(false);

  const handleSummarize = async () => {
    if (!token) return;
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryText(null);

    // 15-second timeout: if the WS event never fires, fail gracefully
    if (summaryTimeoutRef.current) clearTimeout(summaryTimeoutRef.current);
    summaryTimeoutRef.current = setTimeout(() => {
      summaryTimeoutRef.current = null;
      setSummaryText('⚠️ AI took too long to respond. Please try again.');
      setSummaryLoading(false);
    }, 35_000);

    try {
      // POST to queue the job — result arrives via summary_generated WS event
      await api.requestDmSummary(token, conversationId);
      // summaryLoading stays true until the WS event fires (or timeout above)
    } catch (err) {
      if (summaryTimeoutRef.current) {
        clearTimeout(summaryTimeoutRef.current);
        summaryTimeoutRef.current = null;
      }
      console.error('Summary API Error:', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to queue DM summary. Please try again.';
      setSummaryText(`⚠️ ${msg}`);
      setSummaryLoading(false);
    }
  };

  // ── Unread divider & scroll FAB (Tasks 3 & 4) ───────────────────────────
  // Capture lastReadAt at mount time so new incoming messages don't shift the divider
  const lastReadAtRef = useRef<string | null>(null);
  // Other participant's lastReadAt — used for "seen" double-tick on outbound messages
  const [otherUserLastReadAt, setOtherUserLastReadAt] = useState<string | null>(null);
  const unreadDividerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [fabUnreadCount, setFabUnreadCount] = useState(0);
  const fabScrolledPastDividerRef = useRef(false);

  // ── Fetch messages ───────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/direct/${conversationId}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(data.messages ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);
      // Capture lastReadAt at mount time — used to place the unread divider
      if (lastReadAtRef.current === null && data.lastReadAt !== undefined) {
        lastReadAtRef.current = data.lastReadAt ?? null;
      }
      // Capture other participant's lastReadAt for "seen" ticks
      if (data.otherParticipantLastReadAt) {
        setOtherUserLastReadAt(data.otherParticipantLastReadAt);
      }
    } catch (e) {
      console.warn('[DM] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [conversationId, token]);

  useEffect(() => {
    setMessages([]);
    lastMsgIdRef.current = null;
    setActiveThread(null); // clear thread when switching conversations
    fetchMessages();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll & scroll-to-unread divider (Task 3) ─────────────────────

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.id !== lastMsgIdRef.current) {
      const isNewMessage = lastMsgIdRef.current !== null; // false = initial load
      lastMsgIdRef.current = last.id;
      const tid = setTimeout(() => {
        // On initial load → scroll to unread divider or bottom
        if (!isNewMessage) {
          if (unreadDividerRef.current && !fabScrolledPastDividerRef.current) {
            unreadDividerRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
          } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
          }
          return;
        }
        // On new incoming message → only auto-scroll if user is already at bottom
        const container = scrollContainerRef.current;
        if (container) {
          const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          if (distFromBottom < 120) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
          // else: user is reading history — do NOT auto-scroll; FAB count increments instead
        }
      }, 80);
      return () => clearTimeout(tid);
    }
  }, [messages, conversationId]);

  // ── Scroll FAB visibility + auto mark-as-read on scroll-to-bottom ──────────
  // A single scroll listener handles both concerns:
  //   • Shows/hides the FAB when the user is >120px from the bottom.
  //   • Debounced (300 ms) mark-as-read call when the user reaches the bottom
  //     (<10px away). Updates lastReadAtRef immediately so the "Unread messages"
  //     divider vanishes from the UI without a page refresh.

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !token || !conversationId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;

      // FAB visibility
      setShowScrollFab(distanceFromBottom > 120);

      // Mark as read when at the bottom — debounced 300 ms to avoid spamming
      if (distanceFromBottom < 10) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          // Update local ref immediately so the divider disappears instantly
          lastReadAtRef.current = new Date().toISOString();
          setFabUnreadCount(0);
          fabScrolledPastDividerRef.current = false;
          // Persist to backend (fire-and-forget)
          api.markDmRead(token, conversationId).catch(() => {});
        }, 300);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [conversationId, token]);

  // ── WebSocket ────────────────────────────────────────────────────────────
  // Uses the same instanceId + deferred-connect pattern as ChatArea to survive
  // React 18 Strict Mode double-mount without the "WebSocket closed before
  // connection is established" error.

  useEffect(() => {
    if (!token || !conversationId || !user?.id) return;

    // Unique symbol for this effect invocation — guards against Strict Mode
    // cleanup racing with the 50 ms deferred connect.
    const instanceId = Symbol();
    let connectTimer: ReturnType<typeof setTimeout>;

    // Tear down any socket left over from a previous conversation/session.
    const prev = socketRef.current;
    if (prev) {
      prev.removeAllListeners();
      prev.disconnect();
      socketRef.current = null;
    }

    // Create with autoConnect: false so all listeners are attached before
    // the handshake starts — eliminates the race condition.
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      upgrade: false,
    });
    socketRef.current = socket;
    (socket as any).__instanceId = instanceId;

    // ── Lifecycle ──────────────────────────────────────────────────────────

    socket.on('connect', () => {
      // DM WS connected — no logging in production
      socket.emit('join_direct', { conversationId });
    });

    socket.on('connect_error', (err) => {
      console.warn(`[DM WS] ⚠️ Connect error: ${err.message}`);
    });

    socket.on('disconnect', (reason) => {
      console.warn(`[DM WS] ⚠️ Disconnected: ${reason}`);
    });

    socket.on('reconnect', () => {
      // DM WS reconnected — no logging in production
      socket.emit('join_direct', { conversationId });
      // Catch up on any messages missed during the disconnect
      fetchMessages();
    });

    // ── Events ─────────────────────────────────────────────────────────────

    socket.on('new_direct_message', (msg: DirectMessage) => {
      // Replies belong in ThreadPanel only
      if ((msg as any).parentId) {
        setPendingThreadReply(msg as unknown as Message);
        return;
      }
      setMessages((prev) => {
        // Deduplicate: skip if we already have this exact id (real or optimistic replacement)
        if (prev.some((m) => m.id === msg.id)) return prev;

        if (msg.senderId === user?.id) {
          // This is our own message echoed back from server.
          // Find and replace the temp- optimistic placeholder by matching content.
          const tempIdx = prev.findIndex(
            (m) => m.id.startsWith('temp-') && m.content === msg.content && m.senderId === user.id
          );
          if (tempIdx !== -1) {
            // Replace optimistic with real server message
            const next = [...prev];
            next[tempIdx] = { ...msg, reactions: msg.reactions ?? [] };
            return next;
          }
          // No temp placeholder found — this is a duplicate echo, skip it
          // (already replaced by an earlier WS event)
          return prev;
        }

        // Message from the other participant
        const container = scrollContainerRef.current;
        const dist = container
          ? container.scrollHeight - container.scrollTop - container.clientHeight
          : 0;
        if (dist > 120) setFabUnreadCount((c) => c + 1);
        return [...prev, { ...msg, reactions: msg.reactions ?? [] }];
      });
    });

    socket.on(
      'dm_typing',
      ({ userId, username }: { userId: string; username: string; conversationId: string }) => {
        if (userId === user.id) return;
        setTypingUsers((prev) => {
          const n = new Map(prev);
          n.set(userId, username || 'Someone');
          return n;
        });
      }
    );

    socket.on('dm_stopped_typing', ({ userId }: { userId: string }) => {
      setTypingUsers((prev) => {
        const n = new Map(prev);
        n.delete(userId);
        return n;
      });
    });

    // ── dm_message_updated ───────────────────────────────────────────────────
    socket.on('dm_message_updated', (updated: DirectMessage) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === updated.id
            ? { ...m, content: updated.content, isEdited: true, updatedAt: updated.updatedAt, reactions: updated.reactions ?? m.reactions }
            : m
        )
      );
    });

    // ── dm_message_deleted ───────────────────────────────────────────────────
    socket.on('dm_message_deleted', ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    // ── dm_reaction_updated — fired after any reaction add/remove ────────────
    socket.on('dm_reaction_updated', (payload: { messageId: string; reactions: DMReaction[] }) => {
      setMessages((prev) =>
        prev.map((m) => m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m)
      );
    });

    // ── dm_read_receipt — fired when the other participant marks messages read ─
    socket.on('dm_read_receipt', (payload: { conversationId: string; userId: string; lastReadAt: string }) => {
      if (payload.conversationId === conversationId) {
        setOtherUserLastReadAt(payload.lastReadAt);
      }
    });

    // ── summary_generated (Phase 9.3) ────────────────────────────────────────
    // Fired by the BullMQ worker once the Gemini API call completes.
    socket.on('summary_generated', (payload: { summary: string; conversationId?: string }) => {
      if (payload.conversationId && payload.conversationId !== conversationId) return;
      // Clear the 15s timeout — WS arrived in time
      if (summaryTimeoutRef.current) {
        clearTimeout(summaryTimeoutRef.current);
        summaryTimeoutRef.current = null;
      }
      setSummaryText(payload.summary);
      setSummaryLoading(false);
    });

    // Defer connect by 50 ms — gives the React Strict Mode first-invoke cleanup
    // time to cancel this timer before socket.connect() is ever called.
    connectTimer = setTimeout(() => {
      if (socketRef.current === socket && (socket as any).__instanceId === instanceId) {
        socket.connect();
      }
    }, 50);

    // ── Cleanup ─────────────────────────────────────────────────────────────

    return () => {
      clearTimeout(connectTimer);
      (socket as any).__instanceId = null;
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setTypingUsers(new Map());
    };
  }, [conversationId, token, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Typing emit ──────────────────────────────────────────────────────────

  const emitStopTyping = useCallback(() => {
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    socketRef.current?.emit('dm_stopped_typing', { conversationId });
  }, [conversationId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (e.target.value.length > 0 && !isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current?.emit('dm_typing', { conversationId });
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(emitStopTyping, 3000);
  };

  // ── Send message ─────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!input.trim() && !pendingFile) return;
    if (!token || !user) return;
    emitStopTyping();

    const content = input.trim();
    const file = pendingFile;
    setInput('');
    setPendingFile(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(true);

    // ── Optimistic add: show message instantly before server confirms ────────
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: DirectMessage = {
      id: optimisticId,
      content: content || null,
      fileUrl: file?.url ?? null,
      fileType: file?.type ?? null,
      fileSize: file?.size ?? null,
      originalName: file?.name ?? null,
      senderId: user.id,
      conversationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isEdited: false,
      sender: {
        id: user.id,
        username: user.username ?? '',
        fullName: user.fullName ?? null,
        avatar: user.avatar ?? null,
      },
      reactions: [],
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    // Scroll to bottom after optimistic add
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      const res = await fetch(`${API_URL}/direct/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: content || undefined,
          fileUrl: file?.url,
          fileType: file?.type,
          fileSize: file?.size,
          originalName: file?.name,
        }),
      });
      if (!res.ok) {
        // Remove optimistic on failure and restore input
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        if (content) setInput(content);
        if (file) setPendingFile(file);
      }
      // On success: the WS echo (new_direct_message) will replace the temp- placeholder
      // with the real server message. We do NOT update state here to avoid double render.
    } catch (e) {
      console.warn('[DM] send error:', e);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      if (content) setInput(content);
      if (file) setPendingFile(file);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreatePollDM = async (question: string, pollOptions: string[]) => {
    if (!token || !user) return;
    try {
      await fetch(`${API_URL}/direct/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: null, poll: { question, options: pollOptions } }),
      });
      setShowPollModal(false);
    } catch (e) {
      console.error('Create DM poll failed:', e);
    }
  };

  // ── File upload ──────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!token) return;
      setUploadingFile(true);
      try {
        const result = await api.uploadFile(token, file);
        setPendingFile({
          url: result.url,
          type: result.mimeType,
          name: result.originalName,
          size: result.size,
        });
      } catch (e) {
        console.warn('[DM] upload error:', e);
      } finally {
        setUploadingFile(false);
      }
    },
    [token]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // ── Edit handlers ────────────────────────────────────────────────────────

  const handleStartEdit = useCallback((msg: DirectMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content ?? '');
    setEditError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditContent('');
    setEditError(null);
  }, []);

  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      if (!token || !editContent.trim()) return;
      setEditSaving(true);
      setEditError(null);
      const trimmed = editContent.trim();
      try {
        await fetch(`${API_URL}/direct/${conversationId}/messages/${messageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content: trimmed }),
        });
        // Optimistically update local state immediately — don't wait for WS
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content: trimmed, isEdited: true } : m
          )
        );
        setEditingMessageId(null);
        setEditContent('');
      } catch (err) {
        setEditError(err instanceof Error ? err.message : 'Failed to save edit');
      } finally {
        setEditSaving(false);
      }
    },
    [conversationId, token, editContent]
  );

  // ── Reaction handlers ──────────────────────────────────────────────────────
  const handleReactionClick = useCallback(
    async (emoji: string, messageId: string) => {
      if (!token || !user) return;

      // Snapshot for rollback
      const previousMessages = messages.map((m) => ({ ...m }));

      // Optimistic update: one reaction per user — remove ALL of user's reactions
      // then add the new one (unless toggling off the same emoji)
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = m.reactions ?? [];
          const sameEmoji = reactions.find((r) => r.emoji === emoji && r.userId === user.id);
          // Strip all reactions by this user
          const withoutMine = reactions.filter((r) => r.userId !== user.id);
          if (sameEmoji) {
            // Toggle-off: just remove
            return { ...m, reactions: withoutMine };
          }
          // Replace or new: add optimistic placeholder
          return {
            ...m,
            reactions: [
              ...withoutMine,
              { id: `temp-reaction-${Date.now()}`, emoji, userId: user.id, user: { id: user.id, username: user.username ?? '' } },
            ],
          };
        })
      );

      try {
        const res = await fetch(
          `${API_URL}/direct/${conversationId}/messages/${messageId}/reactions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ emoji }),
          }
        );
        if (res.ok) {
          const updated = await res.json();
          // Reconcile with server truth (removes optimistic placeholder)
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, reactions: updated.reactions ?? [] } : m))
          );
        } else {
          // Server rejected — revert
          setMessages(previousMessages);
        }
      } catch (err) {
        console.warn('[DM] reaction error:', err);
        setMessages(previousMessages);
      }
    },
    [conversationId, token, user, messages]
  );

  // ── Delete handlers ──────────────────────────────────────────────────────

  const handleDeleteRequest = useCallback((messageId: string) => {
    setDeleteConfirm({ messageId });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!token || !deleteConfirm) return;
    const { messageId } = deleteConfirm;
    setDeleteConfirm(null);
    // Optimistically remove from local state immediately — don't wait for WS
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await fetch(`${API_URL}/direct/${conversationId}/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.warn('[DM] delete error:', err);
      // Re-fetch on failure to restore the message
      fetchMessages();
    }
  }, [conversationId, token, deleteConfirm, fetchMessages]);

  // ── Load older messages ──────────────────────────────────────────────────

  const loadOlder = async () => {
    if (!token || !nextCursor) return;
    setLoadingOlder(true);
    const topId = messages[0]?.id;
    try {
      const res = await fetch(
        `${API_URL}/direct/${conversationId}/messages?limit=50&cursor=${encodeURIComponent(nextCursor)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      const older: DirectMessage[] = data.messages ?? [];
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !ids.has(m.id)), ...prev];
      });
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);
      if (topId)
        requestAnimationFrame(() =>
          document.getElementById(`dm-${topId}`)?.scrollIntoView({ block: 'start' })
        );
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSelectMessage = useCallback((messageId: string) => {
    setIsSelectionMode(true);
    setSelectedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const handleForwardSelected = useCallback(() => {
    const ids = Array.from(selectedMessageIds);
    const msgs = messages.filter(m => ids.includes(m.id));
    if (msgs.length > 0) {
      setForwardMessage(msgs[0] as any);
      setBulkForwardMessages(msgs as any[]);
      handleCancelSelection();
    }
  }, [selectedMessageIds, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteSelected = useCallback(async () => {
    if (!token) return;
    const ids = Array.from(selectedMessageIds);
    try {
      await fetch(`${API_URL}/direct/${conversationId}/messages/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageIds: ids }),
      });
      setMessages(prev => prev.filter(m => !selectedMessageIds.has(m.id)));
    } catch (err) {
      console.warn('[DM bulk delete] error:', err);
    }
    handleCancelSelection();
  }, [selectedMessageIds, conversationId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePinMessage = useCallback(async (messageId: string) => {
    if (!token) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    // Toggle: if already pinned, unpin; else pin
    const currentlyPinned = pinnedMessage?.id === messageId;
    try {
      await fetch(`${API_URL}/direct/${conversationId}/messages/${messageId}/pin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setPinnedMessage(currentlyPinned ? null : msg);
      setShowPinnedBar(!currentlyPinned);
    } catch (err) {
      console.warn('[DM] pin error:', err);
    }
  }, [conversationId, token, messages, pinnedMessage]);

  const displayName = recipient.fullName || recipient.username;
  const initial = displayName.charAt(0).toUpperCase();

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 dark:text-slate-300">Loading…</p>
      </div>
    );

  return (
    <div className="flex flex-1 h-full min-h-0 overflow-hidden">
    <div
      className={`flex-1 flex flex-col h-full bg-white/60 dark:bg-transparent overflow-hidden relative ${isDragging ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-800 border-2 border-dashed border-blue-400 rounded-xl px-8 py-6 text-blue-500 dark:text-blue-300 text-lg font-semibold">
            Drop file to send
          </div>
        </div>
      )}

      {/* AI Summary Modal */}
      <SummaryModal
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        loading={summaryLoading}
        summary={summaryText}
        channelName={`${recipient.fullName ?? recipient.username}`}
      />

      {/* ── Premium DM Header ───────────────────────────────────────────────── */}
      <div className="h-16 w-full bg-white/70 dark:bg-[#12131A]/70 backdrop-blur-2xl border-b border-white/20 dark:border-white/[0.08] shadow-lg shadow-black/5 dark:shadow-black/40 flex items-center px-4 gap-3 flex-shrink-0 z-10">
        {/* Back button (mobile) */}
        {onBack && (
          <button
            onClick={onBack}
            className="text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex-shrink-0 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-all duration-300 ease-out"
            aria-label="Back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Large avatar with presence dot */}
        <div className="relative flex-shrink-0">
          {recipient.avatar ? (
            <img
              src={recipient.avatar}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-white/10"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-base ring-2 ring-white/10 shadow-lg">
              {initial}
            </div>
          )}
          <span
            className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 shadow ${
              onlineUserIds.has(recipient.id) ? 'bg-emerald-400' : 'bg-slate-400'
            }`}
            title={onlineUserIds.has(recipient.id) ? 'Online' : 'Offline'}
            aria-label={onlineUserIds.has(recipient.id) ? 'Online' : 'Offline'}
          />
        </div>

        {/* Name + status — takes remaining space, truncates gracefully */}
        <div className="min-w-0 flex-1">
          <p className="text-slate-900 dark:text-white font-semibold text-sm leading-tight truncate">
            {displayName}
          </p>
          <p className="text-slate-500 dark:text-slate-300 text-xs leading-tight truncate flex items-center gap-1">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${onlineUserIds.has(recipient.id) ? 'bg-emerald-400' : 'bg-slate-400'}`}
            />
            <span>{onlineUserIds.has(recipient.id) ? 'Active now' : `@${recipient.username}`}</span>
          </p>
        </div>

        {/* Action buttons — premium glassmorphism ghost style */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onStartCall?.(recipient.id, displayName)}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 whitespace-nowrap"
            title="Start video call"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M4 8a2 2 0 012-2h7a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"
              />
            </svg>
            <span className="hidden sm:inline">Call</span>
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleSummarize}
              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 whitespace-nowrap"
            >
              <span aria-hidden="true">✨</span>
              <span className="hidden sm:inline">Summarize</span>
            </button>
          )}
          {/* Header kebab menu */}
          <div className="relative">
            <button
              onClick={() => setShowHeaderMenu(v => !v)}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="More options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
              </svg>
            </button>
            {showHeaderMenu && (
              <div className="absolute right-0 top-10 z-50 w-44 bg-white/90 dark:bg-[#12131A]/90 backdrop-blur-2xl rounded-xl shadow-xl border border-white/20 dark:border-white/[0.08] py-1 overflow-hidden">
                <button
                  onClick={() => { setShowHeaderMenu(false); setShowClearConfirm(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear History
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pinned message bar */}
      {pinnedMessage && showPinnedBar && (
        <PinnedMessageBar
          content={pinnedMessage.content ?? '[attachment]'}
          onClick={() => {
            const el = document.getElementById(`dm-${pinnedMessage.id}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onClose={() => setShowPinnedBar(false)}
        />
      )}

      {/* Messages + scroll FAB wrapper */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto px-4 pt-6 pb-2 space-y-1">
          {hasMore && (
            <div className="flex justify-center pb-2">
              <button
                onClick={loadOlder}
                disabled={loadingOlder}
                className="px-4 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-full transition-all disabled:opacity-50"
              >
                {loadingOlder ? 'Loading…' : '⬆ Load older'}
              </button>
            </div>
          )}

          {messages.map((msg, i) => {
            const isMine = msg.senderId === user?.id;
            const prevMsg = messages[i - 1];
            const nextMsg = messages[i + 1];
            // Group with previous if same sender within 5 minutes
            const isFirstInGroup =
              !prevMsg ||
              prevMsg.senderId !== msg.senderId ||
              new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() >=
                5 * 60 * 1000;
            const isLastInGroup =
              !nextMsg ||
              nextMsg.senderId !== msg.senderId ||
              new Date(nextMsg.createdAt).getTime() - new Date(msg.createdAt).getTime() >=
                5 * 60 * 1000;

            // Unread divider
            const lastReadAt = lastReadAtRef.current;
            const isFirstUnread =
              lastReadAt &&
              new Date(msg.createdAt) > new Date(lastReadAt) &&
              (!prevMsg || new Date(prevMsg.createdAt) <= new Date(lastReadAt));

            // Convert DirectMessage → MessageData for MessageBubble
            const messageData: MessageData = {
              id: msg.id,
              content: msg.content,
              createdAt: msg.createdAt,
              updatedAt: msg.updatedAt,
              isEdited: msg.isEdited,
              user: {
                id: msg.sender.id,
                username: msg.sender.username,
                fullName: msg.sender.fullName || msg.sender.username,
                avatar: msg.sender.avatar,
              },
              reactions: (msg.reactions ?? []).map((r) => ({
                id: r.id,
                emoji: r.emoji,
                userId: r.userId,
                messageId: msg.id,
                createdAt: '',
                user: r.user
                  ? { ...r.user, fullName: r.user.fullName ?? undefined, avatar: r.user.avatar ?? undefined }
                  : undefined,
              })),
              fileUrl: msg.fileUrl,
              fileType: msg.fileType,
              fileSize: msg.fileSize,
              originalName: msg.originalName,
            };

            return (
              <div key={msg.id}>
                {isFirstUnread && <UnreadDivider ref={unreadDividerRef} />}
                <div id={`dm-${msg.id}`}>
                  <MessageBubble
                    message={messageData}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                    isOwnMessage={isMine}
                    isHighlighted={false}
                    currentUserId={user?.id ?? ''}
                    readReceipts={
                      otherUserLastReadAt && isMine
                        ? (new Date(msg.createdAt) <= new Date(otherUserLastReadAt)
                            ? { other: msg.id }
                            : {})
                        : {}
                    }
                    onAddReaction={(msgId: string, emoji: string) =>
                      handleReactionClick(emoji, msgId)
                    }
                    onRemoveReaction={(msgId: string, reactionId: string, emoji: string) =>
                      handleReactionClick(emoji, msgId)
                    }
                    onOpenThread={() => {
                      // Build a Message-compatible object from the DirectMessage
                      const asMessage: Message = {
                        id: msg.id,
                        content: msg.content ?? '',
                        userId: msg.senderId,
                        channelId: conversationId,
                        createdAt: msg.createdAt,
                        updatedAt: msg.updatedAt,
                        isEdited: msg.isEdited,
                        user: {
                          id: msg.sender.id,
                          username: msg.sender.username,
                          fullName: msg.sender.fullName ?? undefined,
                          avatar: msg.sender.avatar ?? undefined,
                        },
                        reactions: (msg.reactions ?? []).map((r) => ({
                          id: r.id,
                          emoji: r.emoji,
                          userId: r.userId,
                          messageId: msg.id,
                          createdAt: '',
                          user: r.user ? { ...r.user, fullName: r.user.fullName ?? undefined, avatar: r.user.avatar ?? undefined } : undefined,
                        })),
                      };
                      setActiveThread(asMessage);
                    }}
                    onStartEdit={() => handleStartEdit(msg)}
                    onDeleteRequest={() => handleDeleteRequest(msg.id)}
                    onCopy={msg.content ? () => handleCopyMessage(msg.content!) : undefined}
                    onForward={() => setForwardMessage(msg)}
                    onPin={() => handlePinMessage(msg.id)}
                    onVotePoll={async (msgId: string, optId: string) => {
                      try {
                        await fetch(`${API_URL}/channels/dm/${msgId}/poll/vote`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ optionId: optId }),
                        });
                      } catch(e) { console.warn('DM Vote failed', e); }
                    }}
                    onSelect={() => handleSelectMessage(msg.id)}
                    onSave={() => handleSaveDmMessage(msg)}
                    onAvatarClick={() => setProfileUser({ id: msg.senderId, username: msg.sender.username, fullName: msg.sender.fullName, avatar: msg.sender.avatar })}
                    isSelected={selectedMessageIds.has(msg.id)}
                    isSelectionMode={isSelectionMode}
                    isEditing={editingMessageId === msg.id}
                    editContent={editContent}
                    editError={editError}
                    editSaving={editSaving}
                    onEditChange={setEditContent}
                    onEditSave={() => handleSaveEdit(msg.id)}
                    onEditCancel={handleCancelEdit}
                  />
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll-to-bottom FAB */}
        <ScrollToBottomFAB
          show={showScrollFab}
          unreadCount={fabUnreadCount}
          onScrollToUnread={() => {
            if (unreadDividerRef.current) {
              unreadDividerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
              fabScrolledPastDividerRef.current = true;
              setFabUnreadCount(0);
            } else {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              fabScrolledPastDividerRef.current = false;
            }
          }}
          onScrollToBottom={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            fabScrolledPastDividerRef.current = false;
            setFabUnreadCount(0);
          }}
        />
      </div>

      {/* Typing indicator */}
      <div className="flex-shrink-0 min-h-[1.75rem]">
        <TypingIndicator typingUsers={typingUsers} />
      </div>

      {/* Delete confirm modal */}
      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Message"
        message="Are you sure you want to delete this message? This cannot be undone."
        danger={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Pending file preview */}
      {pendingFile && (
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-3 bg-slate-200 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 w-fit">
            {pendingFile.type.startsWith('image/') ? (
              <img
                src={pendingFile.url}
                alt={pendingFile.name}
                className="h-20 w-auto object-contain rounded-md flex-shrink-0"
              />
            ) : (
              <span className="text-xl flex-shrink-0">
                {pendingFile.type.startsWith('video/')
                  ? '🎬'
                  : pendingFile.type.startsWith('audio/')
                    ? '🎵'
                    : '📎'}
              </span>
            )}
            <div className="flex flex-col min-w-0">
              <span className="truncate max-w-xs">{pendingFile.name}</span>
              <span className="text-slate-400 dark:text-slate-400 text-xs">{formatFileSize(pendingFile.size)}</span>
            </div>
            <button
              onClick={() => setPendingFile(null)}
              className="text-slate-400 hover:text-red-400 ml-1 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Input or Selection Mode */}
      {isSelectionMode ? (
        <div className="flex-shrink-0 border-t border-slate-200 dark:border-white/[0.08] bg-white/80 dark:bg-[#0A0B10]/80 backdrop-blur-md px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-300">{selectedMessageIds.size} selected</span>
          <button onClick={handleForwardSelected} disabled={selectedMessageIds.size === 0} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white hover:text-white rounded-lg transition-colors">Forward</button>
          <button onClick={handleDeleteSelected} disabled={selectedMessageIds.size === 0} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors">Delete</button>
          <button onClick={handleCancelSelection} className="ml-auto px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Cancel</button>
        </div>
      ) : (
        <div className="px-4 pb-4 flex-shrink-0">
          <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
            {/* Poll button */}
            <button
              type="button"
              onClick={() => setShowPollModal(true)}
              className="flex-shrink-0 p-2 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600"
              title="Create Poll"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors disabled:opacity-50 flex-shrink-0"
              title="Attach file"
            >
              {uploadingFile ? (
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
              )}
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-grow: reset then expand to scrollHeight
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() || pendingFile) handleSend();
                }
                // Shift+Enter: browser inserts newline naturally — do nothing
              }}
              placeholder={`Message ${displayName}`}
              className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 text-sm focus:outline-none resize-none leading-relaxed"
              style={{ minHeight: '24px', maxHeight: '120px', overflowY: 'auto' }}
            />
            <button
              onClick={handleSend}
              disabled={sending || (!input.trim() && !pendingFile)}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center shadow-lg flex-shrink-0 text-white hover:text-white"
              aria-label="Send message"
              title="Send message"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>

      {/* Forward Modal */}
      {forwardMessage && (
        <ForwardModal
          messages={bulkForwardMessages.length > 0 ? bulkForwardMessages.map(m => ({ id: m.id, content: m.content, fileUrl: m.fileUrl, fileType: m.fileType, fileSize: m.fileSize, originalName: m.originalName })) : [{ id: forwardMessage.id, content: forwardMessage.content, fileUrl: forwardMessage.fileUrl, fileType: forwardMessage.fileType, fileSize: forwardMessage.fileSize, originalName: forwardMessage.originalName }]}
          workspaces={[]}
          onClose={() => { setForwardMessage(null); setBulkForwardMessages([]); }}
        />
      )}

      {/* ── Thread Panel ────────────────────────────────────────────────── */}
      {/* Save toast */}
      {saveToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg shadow-indigo-500/30">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.75 3A2.25 2.25 0 0 0 4.5 5.25v15.75l7.5-4.5 7.5 4.5V5.25A2.25 2.25 0 0 0 17.25 3H6.75Z" />
          </svg>
          Saved to Private Cloud!
        </div>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </div>
      )}

      {/* Clear History Confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-white/90 dark:bg-[#12131A]/90 backdrop-blur-2xl border border-white/20 dark:border-white/[0.08] rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/60 p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Clear History</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">Are you sure you want to clear this chat history? All messages will be permanently deleted for everyone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
              <button
                onClick={async () => {
                  setShowClearConfirm(false);
                  try {
                    await fetch(`${API_URL}/direct/${conversationId}/history`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    setMessages([]);
                  } catch (e) {
                    console.error('Clear history failed:', e);
                  }
                }}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
              >Clear History</button>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          isOnline={onlineUserIds?.has(profileUser.id) ?? false}
          onClose={() => setProfileUser(null)}
          isSelf={profileUser.id === user?.id}
        />
      )}

      {activeThread && (
        <ThreadPanel
          parentMessage={activeThread}
          channelId={conversationId}
          onClose={() => setActiveThread(null)}
          workspaceMembers={[]}
          newReply={pendingThreadReply}
          isDm={true}
        />
      )}

      {/* DM Poll Creation Modal */}
      {showPollModal && (
        <CreatePollModal
          onClose={() => setShowPollModal(false)}
          onCreatePoll={handleCreatePollDM}
        />
      )}
    </div>
  );
}
