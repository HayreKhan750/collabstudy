'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import { api, Reaction, Message as ApiMessage, MentionUser, SearchResult } from '@/lib/api';
import MentionInput from './MentionInput';
import SummaryModal from './SummaryModal';
import VoiceChannelBar from './VoiceChannelBar';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { MessageBubble, MessageData } from './message/MessageBubble';
import { TypingIndicator } from './message/TypingIndicator';
import { UnreadDivider } from './message/UnreadDivider';
import { ScrollToBottomFAB } from './message/ScrollToBottomFAB';
import { RelatedMessagesPanel } from './RelatedMessagesPanel';
import ForwardModal from './ForwardModal';
import { PinnedMessageBar } from './PinnedMessageBar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessageUser {
  id: string;
  username: string;
  fullName: string;
  avatar: string | null;
}

interface Message {
  id: string;
  content: string | null;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  parentId?: string | null;
  user: MessageUser;
  reactions: Reaction[];
  mentions?: MentionUser[];
  _count?: { replies: number };
  fileUrl?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  originalName?: string | null;
}

/** userId → 'ONLINE' | 'OFFLINE' */
type PresenceMap = Map<string, 'ONLINE' | 'OFFLINE'>;

interface PresenceUpdatePayload {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
}

interface TypingPayload {
  userId: string;
  channelId: string;
  username?: string;
}

interface ReactionAddedPayload extends Reaction {
  channelId: string;
}

interface ReactionRemovedPayload {
  reactionId: string;
  messageId: string;
  userId: string;
  emoji: string;
}

interface ReadReceiptPayload {
  userId: string;
  channelId: string;
  messageId: string;
  readAt: string;
}

interface ChatAreaProps {
  channelId: string;
  channelName: string;
  workspaceId: string;
  onOpenThread?: (message: ApiMessage) => void;
  workspaceMembers?: MentionUser[];
  onNewReply?: (msg: ApiMessage) => void;
  onBack?: () => void;
  /** Called when a new message arrives from another user (not the current user). */
  onNewMessage?: (msg: Message) => void;
  /** All workspaces (for ForwardModal) */
  workspaces?: { id: string; name: string }[];
  /** When set, ChatArea will jump to this message ID on next render */
  jumpToMessageId?: string;
  /** Called after the jump has been handled so parent can clear it */
  onJumpHandled?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Relative time helper ─────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Minimum ms between successive "user_typing" emissions to the server. */
const TYPING_DEBOUNCE_MS = 400;

/** ms of input inactivity before emitting "user_stopped_typing". */
const TYPING_STOP_MS = 3_000;


// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatArea({ channelId, channelName, workspaceId, onOpenThread, workspaceMembers = [], onNewReply, onNewMessage, onBack, jumpToMessageId, onJumpHandled, workspaces = [] }: ChatAreaProps) {
  const { token, user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  /** Map of userId → username for users currently typing in this channel. */
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());

  /** Global presence state: userId → status */
  const [presence, setPresence] = useState<PresenceMap>(new Map());

  /** messageId of the open emoji picker, or null if closed. */
  const [openPickerFor, setOpenPickerFor] = useState<string | null>(null);

  // ─── Image modal state ────────────────────────────────────────────────────
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // ─── Search state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Edit state ────────────────────────────────────────────────────────────
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ─── File upload state ─────────────────────────────────────────────────────
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ url: string; type: string; name: string; size: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Read receipts: maps userId → messageId (the last message that user has read).
   * Updated in real-time via the `read_receipt_updated` socket event.
   */
  const [readReceipts, setReadReceipts] = useState<Record<string, string>>({});

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const summaryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tracks the ID of the last message we scrolled to — prevents pagination
   *  prepends from triggering a scroll-to-bottom. */
  const lastMessageIdRef = useRef<string | null>(null);

  // ── Delete confirm modal state ───────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{ messageId: string } | null>(null);

  // ── Phase 11.3: Related Messages panel state ─────────────────────────────
  const [relatedSource, setRelatedSource] = useState<Message | null>(null);

  // ── Copy toast state ──────────────────────────────────────────────────────
  const [copyToast, setCopyToast] = useState(false);

  // ── Forward modal state ───────────────────────────────────────────────────
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // ── Pinned message state ──────────────────────────────────────────────────
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [showPinnedBar, setShowPinnedBar] = useState(true);

  // ── Pinned messages ───────────────────────────────────────────────────────
  const handlePinMessage = useCallback(async (messageId: string) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/channels/${channelId}/messages/${messageId}/pin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.warn('[Pin] Failed:', err);
    }
  }, [channelId, token]);

  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  }, []);

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

  const handleDeleteSelected = useCallback(async () => {
    if (!token) return;
    const ids = Array.from(selectedMessageIds);
    try {
      await fetch(`${API_URL}/channels/${channelId}/messages/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageIds: ids }),
      });
      setMessages(prev => prev.filter(m => !selectedMessageIds.has(m.id)));
    } catch (err) {
      console.warn('[Bulk delete] error:', err);
    }
    handleCancelSelection();
  }, [selectedMessageIds, channelId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI Summary modal state ───────────────────────────────────────────────
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);

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
      await api.requestChannelSummary(token, channelId);
      // summaryLoading stays true until the WS event fires (or timeout above)
    } catch (err) {
      if (summaryTimeoutRef.current) { clearTimeout(summaryTimeoutRef.current); summaryTimeoutRef.current = null; }
      console.error('Summary API Error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to queue summary. Please try again.';
      setSummaryText(`⚠️ ${msg}`);
      setSummaryLoading(false);
    }
  };

  // ── Unread divider & scroll FAB (Tasks 3 & 4) ────────────────────────────
  /** lastReadAt captured at mount — marks where the unread divider should appear. */
  const lastReadAtRef = useRef<string | null>(null);
  /** Whether lastReadAt has been captured from the first channel load. */
  const lastReadAtCapturedRef = useRef(false);
  const unreadDividerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [fabUnreadCount, setFabUnreadCount] = useState(0);
  const fabScrolledPastDividerRef = useRef(false);

  /**
   * Tick counter incremented every 30 s to force relative-time labels to
   * re-render without touching the messages array itself.
   */
  const [, setTimeTick] = useState(0);

  /**
   * Typing emission state.
   * isTyping   – whether we've already told the server we're typing
   * debounce   – debounce timer ref (throttles emissions)
   * stopTimer  – inactivity timer ref (fires user_stopped_typing)
   */
  const isTypingRef = useRef(false);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── External jump-to-message (from search modal) ─────────────────────────
  useEffect(() => {
    if (!jumpToMessageId) return;
    jumpToMessage(jumpToMessageId);
    onJumpHandled?.();
  }, [jumpToMessageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Close picker on outside click ────────────────────────────────────────

  useEffect(() => {
    if (!openPickerFor) return;
    const handler = () => setOpenPickerFor(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openPickerFor]);

  // ─── Relative-time refresh ────────────────────────────────────────────────
  // Re-render timestamps every 30 s so "5s ago" → "6s ago" etc. stays accurate.

  useEffect(() => {
    const interval = setInterval(() => setTimeTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // ─── Debounced search ─────────────────────────────────────────────────────
  // Fires 500 ms after the user stops typing. Clears results when query is empty.

  useEffect(() => {
    // Clear any pending debounce
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    searchDebounceRef.current = setTimeout(async () => {
      if (!token) return;
      try {
        const res = await api.searchMessages(token, {
          q: searchQuery.trim(),
          workspaceId,
          limit: 25,
        });
        setSearchResults(res.messages);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Jump to message ──────────────────────────────────────────────────────

  const jumpToMessage = useCallback(async (messageId: string) => {
    // Close the search panel
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);

    // Check if message is already in the loaded list
    const alreadyLoaded = messages.some((m) => m.id === messageId);

    if (alreadyLoaded) {
      // Just scroll to it
      requestAnimationFrame(() => {
        const el = document.getElementById(`msg-${messageId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } else {
      // Simple approach: reload the channel messages, then scroll.
      if (!token) return;
      setLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/channels/${channelId}/messages?limit=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) throw new Error('Failed to fetch messages');
        const data = await response.json();
        setMessages(data.messages ?? []);
        setNextCursor(data.nextCursor ?? null);
        setHasMore(!!data.nextCursor);
      } catch (err) {
        console.warn('[Search] Failed to load messages for jump:', err);
      } finally {
        setLoading(false);
        // Scroll to the target message after loading
        requestAnimationFrame(() => {
          setTimeout(() => {
            const el = document.getElementById(`msg-${messageId}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        });
      }
    }

    // Highlight the message with a brief pulse
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 2000);
  }, [messages, channelId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Fetch historical messages + initial read receipts ────────────────────
  // Extracted as useCallback so it can be safely called from BOTH the initial
  // load effect AND the socket reconnect handler (catch-up fetch on reconnect).

  const fetchChannelData = useCallback(async () => {
    if (!token || !channelId) return;
    setLoading(true);
    try {
      const [messagesRes, receipts] = await Promise.all([
        fetch(
          `${API_URL}/channels/${channelId}/messages?limit=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        api.getReadReceipts(channelId, token),
      ]);

      if (!messagesRes.ok) throw new Error('Failed to fetch messages');

      const data = await messagesRes.json();
      setMessages(data.messages ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);

      // Capture lastReadAt once on initial channel load (Task 3)
      if (!lastReadAtCapturedRef.current) {
        lastReadAtCapturedRef.current = true;
        lastReadAtRef.current = data.lastReadAt ?? null;
      }

      const initialReceipts: Record<string, string> = {};
      for (const r of receipts) initialReceipts[r.userId] = r.messageId;
      setReadReceipts(initialReceipts);
      // receipts loaded — no logging in production
    } catch (error) {
      console.warn('[WS] ⚠️ Error fetching channel data:', error);
    } finally {
      setLoading(false);
    }
  }, [channelId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load older messages ───────────────────────────────────────────────────

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const loadOlderMessages = useCallback(async () => {
    if (!token || !channelId || !nextCursor) return;
    setLoadingOlder(true);

      // fetching older messages — no logging in production

    // Save the ID of the current top message so we can scroll back to it
    // after prepending (the "Slack way" — much more reliable than pixel math).
    const topMessageId = messages[0]?.id ?? null;

    try {
      const response = await fetch(
        `${API_URL}/channels/${channelId}/messages?limit=50&cursor=${encodeURIComponent(nextCursor)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error('Failed to fetch older messages');
      const data = await response.json();
      const older: Message[] = data.messages ?? [];

      // older messages appended — no logging in production

      // Prepend, deduplicating by id — fixes the "same key" React warning
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const unique = older.filter((m) => !existingIds.has(m.id));
        return [...unique, ...prev];
      });
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);

      // After React commits, scroll the old top message back into view
      // so the viewport doesn't jump.
      if (topMessageId) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`msg-${topMessageId}`);
          el?.scrollIntoView({ block: 'start' });
        });
      }
    } catch (err) {
      console.warn('[WS] ⚠️ Error loading older messages:', err);
    } finally {
      setLoadingOlder(false);
    }
  }, [channelId, token, nextCursor, messages]);

  useEffect(() => {
    // Reset state when switching channels, then fetch fresh data.
    setMessages([]);
    setReadReceipts({});
    setNextCursor(null);
    setHasMore(false);
    lastMessageIdRef.current = null; // reset scroll anchor on channel switch
    lastReadAtCapturedRef.current = false; // reset so unread divider recalculates
    fetchChannelData();
  }, [channelId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-scroll ──────────────────────────────────────────────────────────
  // Only scroll when the LAST message ID changes. On initial load, if there's
  // an unread divider, scroll to it; otherwise scroll to bottom (Task 3).

  // Auto-scroll: initial load → unread divider or bottom.
  // Real-time new message → only scroll if already near bottom (Telegram behaviour).
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    const lastId = lastMessage?.id ?? null;
    if (lastId && lastId !== lastMessageIdRef.current) {
      const isNewMessage = lastMessageIdRef.current !== null; // false = initial/channel-switch load
      lastMessageIdRef.current = lastId;
      const tid = setTimeout(() => {
        if (!isNewMessage) {
          // Initial load: jump to unread divider or bottom
          if (unreadDividerRef.current && !fabScrolledPastDividerRef.current) {
            unreadDividerRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
          } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
          }
          return;
        }
        // Real-time message: only auto-scroll when user is already near bottom
        const container = scrollContainerRef.current;
        if (container) {
          const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          if (distFromBottom < 120) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
          // else: user is reading history — FAB badge increments, no auto-scroll
        }
      }, 80);
      return () => clearTimeout(tid);
    }
  }, [messages, channelId]);

  // ─── Scroll FAB visibility + auto mark-as-read on scroll-to-bottom ────────
  // A single scroll listener handles both concerns:
  //   • Shows/hides the FAB when the user is >120px from the bottom.
  //   • Debounced (300 ms) mark-as-read call when the user reaches the bottom
  //     (<10px away). Updates lastReadAtRef immediately so the "Unread messages"
  //     divider vanishes from the UI without a page refresh.

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !token || !channelId) return;

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
          api.markChannelRead(token, channelId).catch(() => {});
        }, 300);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [channelId, token]);

  // ─── WebSocket: connection + ALL listeners in one effect ──────────────────
  // Uses an instanceId guard to survive React 18 Strict Mode double-invocation.
  // The cleanup from the first invoke cancels the deferred connect and tears
  // down the socket BEFORE the second invoke creates a new one — so only one
  // live WebSocket ever exists at a time.

  useEffect(() => {
    if (!token || !channelId || !user?.id) return;

    // Unique ID for this effect invocation — used to cancel the deferred
    // connect if cleanup fires before the 50 ms timer elapses.
    const instanceId = Symbol();
    let connectTimer: ReturnType<typeof setTimeout>;

    // Tear down any socket left over from a previous channel/session.
    const prev = socketRef.current;
    if (prev) {
      prev.removeAllListeners();
      prev.disconnect();
      socketRef.current = null;
    }

    // Create with autoConnect: false so we attach all listeners before the
    // handshake starts, eliminating the "WebSocket closed before established" race.
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      autoConnect: false,
      // Disable transport upgrade negotiation — we're already on websocket,
      // and the upgrade handshake can race with connection teardown.
      upgrade: false,
    });
    socketRef.current = socket;
    // Tag the socket so the connect timer can verify it's still the active one.
    (socket as any).__instanceId = instanceId;

    // ── Connection lifecycle ────────────────────────────────────────────────

    socket.on('connect', () => {
      // WS connected — no logging in production
      socket.emit('join_channel', { channelId });
    });

    socket.on('connect_error', (err) => {
      // Use warn not error — Next.js dev overlay intercepts console.error
      // and halts the UI, but socket connection hiccups are transient and normal.
      console.warn(`[WS] ⚠️ SOCKET CONNECT ERROR: ${err.message}`);
    });

    socket.on('disconnect', (reason) => {
      console.warn(`%c[WS] ⚠️  SOCKET DISCONNECTED: ${reason}  socket=${socket.id}  channel=${channelId}`, 'color: #fb923c; font-weight: bold');
    });

    socket.on('reconnect_attempt', (attempt: number) => {
      // WS reconnect attempt — no logging in production
    });

    socket.on('reconnect', (attempt: number) => {
      // WS reconnected — no logging in production
      // Re-join the channel room first, then catch up on any messages
      // missed during the disconnect window (Socket.IO doesn't buffer).
      socket.emit('join_channel', { channelId });
      // catch-up fetch after reconnect — no logging in production
      fetchChannelData();
    });

    socket.on('reconnect_failed', () => {
      console.warn(`[WS] ⚠️ RECONNECT FAILED after all attempts for channel=${channelId}`);
    });

    // ── new_message ─────────────────────────────────────────────────────────
    // • Top-level messages (no parentId) → append to the main list.
    // • Reply messages (has parentId)    → increment parent's _count.replies.
    //   The reply itself is rendered by ThreadPanel, not here.

    socket.on('new_message', (message: Message) => {
      // message received via WS — no logging in production
      if (!message.parentId) {
        // Top-level message — add to main list, deduplicate by id
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          // Increment FAB badge for messages from others when not at bottom
          if (message.user?.id !== user?.id) {
            const container = scrollContainerRef.current;
            const dist = container
              ? container.scrollHeight - container.scrollTop - container.clientHeight
              : 0;
            if (dist > 120) setFabUnreadCount((c) => c + 1);
          }
          return [...prev, { ...message, reactions: message.reactions ?? [] }];
        });
        // Only notify for messages from OTHER users (not our own echo)
        if (message.user?.id !== user?.id) onNewMessage?.(message);
      } else {
        // Reply — find the parent and increment its reply count
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== message.parentId) return m;
            const currentCount = m._count?.replies ?? 0;
            return {
              ...m,
              _count: { replies: currentCount + 1 },
            };
          }),
        );
        // Notify the thread panel (if open) about the new reply
        onNewReply?.(message as unknown as ApiMessage);
      }
    });

    // ── reaction_added ───────────────────────────────────────────────────────

    socket.on('reaction_added', (reaction: ReactionAddedPayload) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== reaction.messageId) return m;
          // One reaction per user: strip ALL existing reactions by this user
          // (including optimistic placeholders and any previous emoji) before
          // adding the confirmed server reaction.
          const withoutThisUser = m.reactions.filter(
            (r) => r.userId !== reaction.userId,
          );
          // Guard against duplicates from other sources
          if (withoutThisUser.some((r) => r.id === reaction.id)) {
            return { ...m, reactions: withoutThisUser };
          }
          return { ...m, reactions: [...withoutThisUser, reaction] };
        }),
      );
    });

    // ── reaction_removed ─────────────────────────────────────────────────────

    socket.on('reaction_removed', ({ reactionId, messageId }: ReactionRemovedPayload) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          return { ...m, reactions: m.reactions.filter((r) => r.id !== reactionId) };
        }),
      );
    });

    // ── user_typing ─────────────────────────────────────────────────────────

    socket.on('user_typing', ({ userId, username }: TypingPayload) => {
      if (userId === user.id) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(userId, username || 'Someone');
        return next;
      });
    });

    // ── user_stopped_typing ─────────────────────────────────────────────────

    socket.on('user_stopped_typing', ({ userId }: TypingPayload) => {
      setTypingUsers((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    // ── user_presence_update ────────────────────────────────────────────────

    socket.on('user_presence_update', ({ userId, status }: PresenceUpdatePayload) => {
      setPresence((prev) => {
        const next = new Map(prev);
        next.set(userId, status);
        return next;
      });
    });

    // ── presence_sync ───────────────────────────────────────────────────────

    socket.on('presence_sync', (onlineUserIds: string[]) => {
      setPresence((prev) => {
        const next = new Map(prev);
        for (const uid of onlineUserIds) next.set(uid, 'ONLINE');
        return next;
      });
    });

    // ── read_receipt_updated ─────────────────────────────────────────────────

    socket.on('read_receipt_updated', ({ userId, messageId }: ReadReceiptPayload) => {
      // read receipt update — no logging in production
      setReadReceipts((prev) => ({ ...prev, [userId]: messageId }));
    });

    // ── message_updated ──────────────────────────────────────────────────────
    socket.on('message_updated', (updated: Message) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === updated.id
            ? { ...m, content: updated.content, isEdited: true, updatedAt: updated.updatedAt }
            : m,
        ),
      );
    });

    // ── message_deleted ──────────────────────────────────────────────────────
    socket.on('message_deleted', ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    // ── summary_generated (Phase 9.3) ────────────────────────────────────────
    // Fired by the BullMQ worker once the Gemini API call completes.
    socket.on('summary_generated', (payload: { summary: string; channelId?: string }) => {
      if (payload.channelId && payload.channelId !== channelId) return;
      // Clear the 15s timeout — WS arrived in time
      if (summaryTimeoutRef.current) { clearTimeout(summaryTimeoutRef.current); summaryTimeoutRef.current = null; }
      setSummaryText(payload.summary);
      setSummaryLoading(false);
    });

    // Defer connect by one tick so any in-flight disconnect from a prior socket
    // fully closes before we send the new WebSocket upgrade request.
    // Double-guard: check both the ref AND the instanceId so a Strict Mode
    // cleanup that fires between creation and connect can't trigger a connect
    // on an already-torn-down socket.
    connectTimer = setTimeout(() => {
      if (
        socketRef.current === socket &&
        (socket as any).__instanceId === instanceId
      ) {
        socket.connect();
      }
    }, 50);

    // ── Cleanup ─────────────────────────────────────────────────────────────

    return () => {
      // WS cleanup — no logging in production
      // Cancel the deferred connect FIRST — this is the critical step that
      // prevents the Strict Mode race. If cleanup fires within the 50 ms
      // window, the timer is cancelled before socket.connect() is ever called.
      clearTimeout(connectTimer);
      // Invalidate the instanceId so even if the timer somehow fires late it
      // will fail the guard check and not call socket.connect().
      (socket as any).__instanceId = null;
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setTypingUsers(new Map());
      // Reset summary loading state on channel switch
      setSummaryLoading(false);
    };
  }, [channelId, token, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Typing: emit helpers ──────────────────────────────────────────────────

  const emitStopTyping = useCallback(() => {
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    socketRef.current?.emit('user_stopped_typing', { channelId });
  }, [channelId]);

  const handleTypingEmit = useCallback(() => {
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(emitStopTyping, TYPING_STOP_MS);

    if (isTypingRef.current) return;

    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        socketRef.current?.emit('user_typing', { channelId });
      }
    }, TYPING_DEBOUNCE_MS);
  }, [channelId, emitStopTyping]);

  useEffect(() => {
    return () => {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socketRef.current?.emit('user_stopped_typing', { channelId });
      }
    };
  }, [channelId]);

  // ─── Message input handler ─────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (e.target.value.length > 0) {
      handleTypingEmit();
    } else {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
      emitStopTyping();
    }
  };

  // ─── Send message ──────────────────────────────────────────────────────────

  // ref to the MentionInput textarea — used to reset auto-grow height after send
  const mentionInputRef = useRef<HTMLTextAreaElement>(null);

  const handleSendMessage = async (mentionIds: string[]) => {
    if (!newMessage.trim() && !pendingFile) return;
    if (!token) return;

    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    emitStopTyping();

    setSendError(null);
    const content = newMessage.trim();
    const fileToSend = pendingFile;
    setNewMessage('');
    setPendingFile(null);
    // Reset textarea auto-grow height so it returns to one row after send
    if (mentionInputRef.current) {
      mentionInputRef.current.style.height = 'auto';
    }

    try {
      await api.sendMessage(
        channelId,
        content,       // may be '' for file-only messages — backend accepts it
        token,
        undefined,     // parentId — top-level message
        mentionIds,
        fileToSend?.url,
        fileToSend?.type,
        fileToSend?.size,
        fileToSend?.name,
      );
    } catch (error) {
      console.warn('[WS] ⚠️ Error sending message:', error);
      setSendError(error instanceof Error ? error.message : 'Failed to send. Please try again.');
      if (content) setNewMessage(content);
      if (fileToSend) setPendingFile(fileToSend);
    }
  };

  // ─── Reaction error toast ──────────────────────────────────────────────────

  const [reactionError, setReactionError] = useState<string | null>(null);

  const showReactionError = (msg: string) => {
    setReactionError(msg);
    setTimeout(() => setReactionError(null), 3000);
  };

  // ─── Reaction toggle (true optimistic update) ──────────────────────────────

  const handleReactionClick = useCallback(
    async (message: Message, emoji: string) => {
      if (!token || !user?.id) return;
      // Guard: never call the API with a synthetic or missing message ID
      if (!message.id || message.id.startsWith('optimistic-')) return;

      setOpenPickerFor(null);

      // Find if this user already reacted with THIS emoji (toggle-off case)
      const sameEmojiReaction = message.reactions.find(
        (r) => r.emoji === emoji && r.userId === user.id,
      );
      // Find if this user already reacted with ANY OTHER emoji (replace case)
      const anyOtherReaction = message.reactions.find(
        (r) => r.userId === user.id && r.emoji !== emoji,
      );

      // 1. Snapshot current state for rollback
      const previousReactions = [...message.reactions];

      // 2. Optimistic update: remove all of this user's reactions, then add new one
      //    (unless toggling off the same emoji — then just remove)
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message.id) return m;
          // Strip all reactions by this user
          const withoutMine = m.reactions.filter((r) => r.userId !== user.id);
          if (sameEmojiReaction) {
            // Toggle-off: just remove, don't add
            return { ...m, reactions: withoutMine };
          }
          // Replace or new: add optimistic new reaction
          const optimistic: Reaction = {
            id: `optimistic-${Date.now()}`,
            emoji,
            userId: user.id,
            messageId: message.id,
            createdAt: new Date().toISOString(),
          };
          return { ...m, reactions: [...withoutMine, optimistic] };
        }),
      );

      // 3. Fire API call — server enforces one-reaction-per-user
      //    addReaction handles both replace and toggle-off server-side
      try {
        await api.addReaction(channelId, message.id, emoji, token);
        // Real reaction arrives via socket reaction_added / reaction_removed events
        // which reconcile the optimistic state with the server truth.
      } catch (err) {
        // 4. Revert to exact pre-click snapshot
        const errorMessage =
          err instanceof Error ? err.message : 'Could not update reaction. Please try again.';
        console.warn('[Reaction] ⚠️ error, reverting optimistic update:', errorMessage);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id ? { ...m, reactions: previousReactions } : m,
          ),
        );
        showReactionError(errorMessage);
      }
    },
    [channelId, token, user?.id],
  );

  // ─── Edit message handler ──────────────────────────────────────────────────
  const handleStartEdit = useCallback((message: Message) => {
    setEditingMessageId(message.id);
    setEditContent(message.content ?? '');
    setEditError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditContent('');
    setEditError(null);
  }, []);

  const handleSaveEdit = useCallback(async (messageId: string) => {
    if (!token || !editContent.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await api.editMessage(channelId, messageId, editContent.trim(), token);
      // The real update arrives via socket message_updated
      setEditingMessageId(null);
      setEditContent('');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save edit');
    } finally {
      setEditSaving(false);
    }
  }, [channelId, token, editContent]);

  // ─── Delete message handler ────────────────────────────────────────────────
  const handleDeleteMessage = useCallback((messageId: string) => {
    if (!token) return;
    setDeleteConfirm({ messageId });
  }, [token]);

  const confirmDeleteMessage = useCallback(async () => {
    if (!token || !deleteConfirm) return;
    const { messageId } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await api.deleteMessage(channelId, messageId, token);
      // The deletion propagates via socket message_deleted
    } catch (err) {
      console.warn('[Delete] Failed:', err);
    }
  }, [channelId, token, deleteConfirm]);

  // ─── File upload handler ──────────────────────────────────────────────────
  const doUpload = useCallback(async (file: File) => {
    if (!token) return;
    setUploadingFile(true);
    setUploadError(null);
    try {
      const result = await api.uploadFile(token, file);
      setPendingFile({ url: result.url, type: result.mimeType, name: result.originalName, size: result.size });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setUploadingFile(false);
    }
  }, [token]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    doUpload(file);
  }, [doUpload]);

  // ─── Drag-and-drop handlers ────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  }, [doUpload]);


  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
        <p className="text-slate-500 dark:text-slate-400">Loading messages…</p>
      </div>
    );
  }

  // ─── Image modal (rendered at root so it overlays everything) ─────────────
  const ImageModal = selectedImage ? (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={() => setSelectedImage(null)}
    >
      <button
        className="absolute top-4 right-4 text-white bg-slate-800/60 hover:bg-slate-700 rounded-full p-2 transition-colors"
        onClick={() => setSelectedImage(null)}
        aria-label="Close image"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={selectedImage}
        alt="Full-size preview"
        className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  ) : null;

  // ─── Keyword highlight helper ───────────────────────────────────────────────
  // Wraps each occurrence of `term` in the message text with a highlight span.
  // Returns an array of plain strings and highlighted <mark> elements.

  const highlightText = (text: string, term: string): React.ReactNode[] => {
    if (!term.trim()) return [text];
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark key={i} className="bg-yellow-400 text-gray-900 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  const isSearchActive = searchQuery.trim().length > 0;

  // ─── Smart file attachment renderer ──────────────────────────────────────
  // Renders outside the bubble div so file cards never clash with bubble bg.
  const renderFileAttachment = (msg: Message, isMine: boolean) => {
    if (!msg.fileUrl) return null;
    const mime = msg.fileType || '';
    const name = msg.originalName || 'File';
    const size = msg.fileSize;
    const formatSize = (b: number) =>
      b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

    // Images: inline preview, click to open lightbox
    if (mime.startsWith('image/')) {
      return (
        <img
          src={msg.fileUrl}
          alt={name}
          className="mt-1 max-w-xs rounded-2xl cursor-pointer hover:opacity-90 transition-opacity shadow-md"
          onClick={() => setSelectedImage(msg.fileUrl!)}
        />
      );
    }

    // Video: native player
    if (mime.startsWith('video/')) {
      return (
        <video
          src={msg.fileUrl}
          controls
          className="mt-1 max-w-sm rounded-2xl shadow-md"
        />
      );
    }

    // Audio: native player
    if (mime.startsWith('audio/')) {
      return <audio src={msg.fileUrl} controls className="mt-1 w-64 rounded-lg" />;
    }

    // Shared card style for text & generic files — adapts to bubble colour
    const cardBg = isMine
      ? 'bg-blue-700 hover:bg-blue-800 border-blue-500 text-white'
      : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border-slate-300 dark:border-slate-500 text-slate-800 dark:text-slate-100';

    // Text file: open in new tab
    if (mime.startsWith('text/')) {
      return (
        <a
          href={msg.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-1 flex items-center gap-2 border rounded-xl px-3 py-2 text-sm transition-colors max-w-xs ${cardBg}`}
        >
          <span className="text-2xl flex-shrink-0">📄</span>
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium">{name}</span>
            {size && <span className="text-xs opacity-60">{formatSize(size)}</span>}
          </div>
        </a>
      );
    }

    // Generic file: download card
    return (
      <a
        href={msg.fileUrl}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-1 flex items-center gap-2 border rounded-xl px-3 py-2 text-sm transition-colors max-w-xs ${cardBg}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 flex-shrink-0 opacity-80"
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
        <div className="flex flex-col min-w-0">
          <span className="truncate font-medium">{name}</span>
          {size && <span className="text-xs opacity-60">{formatSize(size)}</span>}
          <span className="text-xs opacity-70 flex items-center gap-0.5 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </span>
        </div>
      </a>
    );
  };

  return (
  <div className="flex h-full flex-1 overflow-hidden">
    <div
      className={`flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative ${isDragging ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-800 border-2 border-dashed border-blue-400 rounded-xl px-8 py-6 text-blue-500 dark:text-blue-300 text-lg font-semibold">
            Drop file to upload
          </div>
        </div>
      )}
      {ImageModal}
      {/* Header */}
      <div className="h-16 w-full bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center px-4 gap-3 flex-shrink-0 z-10">
        {/* Mobile back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden flex-shrink-0 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Back to sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-white font-semibold truncate"># {channelName}</h2>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleSummarize}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 flex-shrink-0"
          >
            <span>✨</span>
            <span className="hidden sm:inline">Summarize</span>
          </button>
        )}

        {/* Search bar */}
        <div className="ml-auto flex items-center gap-2 w-64">
          <div className="relative flex-1">
            {/* Search icon */}
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 pointer-events-none"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 dark:placeholder-slate-500 rounded-md pl-8 pr-3 py-1.5 border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            {/* Spinner while fetching */}
            {isSearching && (
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
          </div>
          {/* Clear / close button — only shown when search is active */}
          {isSearchActive && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchError(null); }}
              className="flex-shrink-0 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Body: chat messages OR search results panel ── */}
      <div className="flex flex-1 overflow-hidden relative">

      {/* Search Results Panel — slides in from the right when search is active */}
      {isSearchActive && (
        <div className="absolute inset-y-0 right-0 w-96 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-white/5 flex flex-col z-30 shadow-2xl">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
            <div>
              <h3 className="text-white text-sm font-semibold">Search results</h3>
              {!isSearching && (
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                  {searchResults.length === 0
                    ? `No results for "${searchQuery}"`
                    : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`}
                </p>
              )}
            </div>
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchError(null); }}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
              title="Close search"
              aria-label="Close search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto">
            {isSearching ? (
              <div className="flex items-center justify-center h-32 text-slate-400 dark:text-slate-500 text-sm gap-2">
                <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Searching…
              </div>
            ) : searchError ? (
              <div className="flex items-center justify-center h-32 text-red-400 text-sm px-4 text-center">
                {searchError}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-400 dark:text-slate-500 text-sm gap-2 px-4 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                No messages matched your search.
                <span className="text-xs text-slate-400 dark:text-slate-500">Try a different keyword.</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {searchResults.map((result) => {
                  const displayName = result.user.fullName || result.user.username;
                  const initial = displayName.charAt(0).toUpperCase();
                  return (
                    <li
                      key={result.id}
                      className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => jumpToMessage(result.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') jumpToMessage(result.id); }}
                    >
                      {/* Channel badge */}
                      <p className="text-xs text-blue-400 font-medium mb-1.5">
                        # {result.channelName}
                      </p>
                      {/* Sender + timestamp */}
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                          {initial}
                        </div>
                        <span className="text-white text-xs font-semibold">{displayName}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-xs ml-auto" title={new Date(result.createdAt).toLocaleString()}>
                          {formatRelativeTime(result.createdAt)}
                        </span>
                      </div>
                      {/* Message content with keyword highlight */}
                      <p className="text-slate-600 dark:text-slate-300 text-sm leading-snug break-words pl-8">
                        {highlightText(result.content, searchQuery.trim())}
                      </p>
                      {/* Similarity score badge */}
                      <div className="pl-8 mt-1">
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {Math.round(result.similarity * 100)}% match
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      {/* Pinned message bar */}
      {pinnedMessage && showPinnedBar && (
        <PinnedMessageBar
          content={pinnedMessage.content ?? '[attachment]'}
          onClick={() => {
            const el = document.getElementById(`msg-${pinnedMessage.id}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onClose={() => setShowPinnedBar(false)}
        />
      )}

      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-2 space-y-1">

        {/* Load older messages button — only shown when more history exists */}
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="px-4 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {loadingOlder ? (
                <>
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading…
                </>
              ) : (
                '⬆ Load older messages'
              )}
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No messages yet. Start the conversation!
            </p>
          </div>
        ) : (
          messages.map((message, i) => {
            const isMine = message.user.id === user?.id;

            // ── Telegram-style grouping ───────────────────────────────────
            const prevMsg = messages[i - 1];
            const nextMsg = messages[i + 1];
            const isFirstInGroup = !prevMsg ||
              prevMsg.user.id !== message.user.id ||
              (new Date(message.createdAt).getTime() - new Date(prevMsg.createdAt).getTime()) >= 5 * 60 * 1000;
            const isLastInGroup = !nextMsg ||
              nextMsg.user.id !== message.user.id ||
              (new Date(nextMsg.createdAt).getTime() - new Date(message.createdAt).getTime()) >= 5 * 60 * 1000;

            // ── Unread divider ────────────────────────────────────────────
            const lastReadAt = lastReadAtRef.current;
            const isFirstUnread = !!lastReadAt &&
              new Date(message.createdAt) > new Date(lastReadAt) &&
              (!prevMsg || new Date(prevMsg.createdAt) <= new Date(lastReadAt));

            return (
              <div key={message.id}>
                {/* New Messages divider */}
                {isFirstUnread && (
                  <UnreadDivider ref={unreadDividerRef} />
                )}
                <MessageBubble
                  message={message as MessageData}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  isOwnMessage={isMine}
                  isHighlighted={highlightedMessageId === message.id}
                  currentUserId={user?.id ?? ''}
                  readReceipts={readReceipts}
                  onAddReaction={(msgId, emoji) => {
                    const msg = messages.find(m => m.id === msgId);
                    if (msg) handleReactionClick(msg, emoji);
                  }}
                  onRemoveReaction={(msgId, reactionId, emoji) => {
                    const msg = messages.find(m => m.id === msgId);
                    if (msg) handleReactionClick(msg, emoji);
                  }}
                  onOpenThread={() => onOpenThread?.(message as unknown as ApiMessage)}
                  onStartEdit={() => handleStartEdit(message)}
                  onDeleteRequest={() => handleDeleteMessage(message.id)}
                  isEditing={editingMessageId === message.id}
                  editContent={editContent}
                  editError={editError}
                  editSaving={editSaving}
                  onEditChange={setEditContent}
                  onEditSave={() => handleSaveEdit(message.id)}
                  onEditCancel={handleCancelEdit}
                  onFindSimilar={message.content ? () => setRelatedSource(message) : undefined}
                  onCopy={message.content ? () => handleCopyMessage(message.content!) : undefined}
                  onForward={message.content ? () => setForwardMessage(message) : undefined}
                  onPin={() => {
                    handlePinMessage(message.id);
                    setPinnedMessage((prev) => prev?.id === message.id ? null : message);
                    setShowPinnedBar(true);
                  }}
                  onSelect={() => handleSelectMessage(message.id)}
                  isSelected={selectedMessageIds.has(message.id)}
                />
              </div>
            );
          })
        )}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

        {/* Scroll-to-bottom FAB */}
        <ScrollToBottomFAB
          show={showScrollFab}
          unreadCount={fabUnreadCount}
          onScrollToUnread={() => {
            if (unreadDividerRef.current) {
              unreadDividerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      </div>{/* end flex body row */}

      {/* Typing indicator */}
      <div className="flex-shrink-0 min-h-[1.75rem]">
        <TypingIndicator typingUsers={typingUsers} />
      </div>

      {/* Bulk Selection Action Bar */}
      {isSelectionMode && (
        <div className="flex-shrink-0 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">{selectedMessageIds.size} selected</span>
          <button
            onClick={() => {
              const firstId = Array.from(selectedMessageIds)[0];
              const msg = messages.find(m => m.id === firstId);
              if (msg) { setForwardMessage(msg); handleCancelSelection(); }
            }}
            disabled={selectedMessageIds.size === 0}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >Forward</button>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedMessageIds.size === 0}
            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >Delete</button>
          <button onClick={handleCancelSelection} className="ml-auto px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Cancel</button>
        </div>
      )}

      {/* Input */}
      {!isSelectionMode && (
      <div className="flex-shrink-0 px-4 pb-4">
        {sendError && <p className="text-red-400 text-xs mb-1">{sendError}</p>}
        {reactionError && <p className="text-red-400 text-xs mb-1">{reactionError}</p>}
        {uploadError && <p className="text-red-400 text-xs mb-1">{uploadError}</p>}

        {/* Pending file preview */}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-3 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm">
            {pendingFile.type.startsWith('image/') ? (
              <img src={pendingFile.url} alt={pendingFile.name} className="h-20 w-auto object-contain rounded-md flex-shrink-0" />
            ) : (
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 min-w-0">
                <span className="text-xl flex-shrink-0">{pendingFile.type.startsWith('video/') ? '🎬' : pendingFile.type.startsWith('audio/') ? '🎵' : '📎'}</span>
                <span className="truncate max-w-xs">{pendingFile.name}</span>
                <span className="text-slate-400 dark:text-slate-400 text-xs flex-shrink-0">({pendingFile.size < 1024*1024 ? (pendingFile.size/1024).toFixed(1)+' KB' : (pendingFile.size/(1024*1024)).toFixed(1)+' MB'})</span>
              </div>
            )}
            <button
              onClick={() => setPendingFile(null)}
              className="ml-auto text-slate-400 hover:text-red-400 transition-colors flex-shrink-0"
              title="Remove attachment"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Paperclip button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50"
            title="Attach file"
            aria-label="Attach file"
          >
            {uploadingFile ? (
              <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            )}
          </button>

          {/* Message input */}
          <div className="flex-1">
            <MentionInput
                  inputRef={mentionInputRef}
              value={newMessage}
              onChange={setNewMessage}
              onSend={handleSendMessage}
              onTyping={handleTypingEmit}
              members={workspaceMembers}
              placeholder={pendingFile ? 'Add a message (optional)…' : `Message #${channelName}`}
              hasPendingFile={!!pendingFile}
            />
          </div>
        </div>
      </div>
      )} {/* end !isSelectionMode */}

      {/* AI Summary Modal */}
      <SummaryModal
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        loading={summaryLoading}
        summary={summaryText}
        channelName={channelName}
      />

      {/* Voice channel bar — sits at the bottom of the chat panel */}
      <VoiceChannelBar
        channelId={channelId}
        channelName={channelName}
        socket={socketRef.current}
        currentUserId={user?.id ?? ''}
        currentUsername={user?.username ?? ''}
      />

      {/* Delete message confirm modal */}
      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Message"
        message="Are you sure you want to delete this message? This cannot be undone."
        confirmLabel="Delete"
        danger={true}
        onConfirm={confirmDeleteMessage}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>

    {/* Phase 11.3: Related Messages side panel — slides in from the right */}
    {/* ── Copy toast ────────────────────────────────────────────────────── */}
    {copyToast && (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Copied!
      </div>
    )}

    {/* Forward Modal */}
    {forwardMessage && (
      <ForwardModal
        message={forwardMessage}
        workspaces={workspaces}
        onClose={() => setForwardMessage(null)}
      />
    )}

    {relatedSource && token && (
      <RelatedMessagesPanel
        sourceMessage={relatedSource}
        workspaceId={workspaceId}
        token={token}
        onClose={() => setRelatedSource(null)}
        onSelectResult={(targetChannelId, targetMessageId) => {
          // If the result is in this channel, jump directly
          if (targetChannelId === channelId) {
            jumpToMessage(targetMessageId);
          } else {
            // Cross-channel: close the panel and let the parent handle navigation
            // by highlighting the message once the channel switches
            setHighlightedMessageId(targetMessageId);
            // The parent (dashboard) handles channel switching via onOpenThread pattern
            // For now we just close the panel — cross-channel jump is a future enhancement
            setRelatedSource(null);
          }
        }}
      />
    )}
  </div>
  );
}
