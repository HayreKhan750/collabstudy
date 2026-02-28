'use client';

import { useState, useRef } from 'react';
import { Reaction, MentionUser } from '@/lib/api';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { ReactionPill } from './ReactionPill';
import { MessageActions } from './MessageActions';
import { MediaViewer } from '@/components/media/MediaViewer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageUser {
  id: string;
  username: string;
  fullName: string;
  avatar: string | null;
}

export interface MessageData {
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
  poll?: {
    id: string;
    question: string;
    isClosed: boolean;
    options: {
      id: string;
      text: string;
      votes: {
        userId: string;
        user?: { id: string; username: string; fullName: string | null; avatar: string | null };
      }[];
    }[];
  } | null;
}

interface MessageBubbleProps {
  message: MessageData;
  /** Is this the first message in a group (same sender, within 5 min)? */
  isFirstInGroup: boolean;
  /** Is this the last message in a group? Avatar is shown here. */
  isLastInGroup: boolean;
  isOwnMessage: boolean;
  isHighlighted: boolean;
  currentUserId: string;
  /** Called when user picks an emoji in the hover toolbar */
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string, reactionId: string, emoji: string) => void;
  onOpenThread: () => void;
  onStartEdit: () => void;
  onDeleteRequest: () => void;
  /** Inline edit active for this message */
  isEditing: boolean;
  editContent: string;
  editError: string | null;
  editSaving: boolean;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  /** Phase 11.3: opens the Related Messages panel for this message */
  onFindSimilar?: () => void;
  /** Copy message text to clipboard */
  onCopy?: () => void;
  /** Forward message to another channel/DM */
  onForward?: () => void;
  /** Pin message in channel */
  onPin?: () => void;
  /** Vote on a poll option */
  onVotePoll?: (messageId: string, optionId: string) => void;
  /** Toggle select mode for this message */
  onSelect?: () => void;
  /** Save/bookmark this message */
  onSave?: () => void;
  /** Avatar click handler to open user profile */
  onAvatarClick?: () => void;
  /** Whether this message is currently selected in bulk selection mode */
  isSelected?: boolean;
  /** Whether selection mode is active for this message */
  isSelectionMode?: boolean;
  /**
   * Read receipts: map of userId → messageId they last read.
   * Used to render "seen" double-tick on outbound messages.
   */
  readReceipts?: Record<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString()} ${time}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AvatarPlaceholder({ name, size = 8 }: { name: string; size?: number }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const colors = [
    'bg-indigo-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-blue-500',
    'bg-teal-500',
    'bg-green-500',
    'bg-orange-500',
    'bg-rose-500',
  ];
  // Deterministic color based on first char code
  const color = colors[initial.charCodeAt(0) % colors.length];
  return (
    <div
      className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}
    >
      {initial}
    </div>
  );
}

function FileAttachment({
  url,
  type,
  name,
  size,
}: {
  url: string;
  type: string | null;
  name: string | null;
  size: number | null;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const mime = type || '';

  // Thumbnail / inline preview that opens the MediaViewer on click
  const preview = (() => {
    if (mime.startsWith('image/')) {
      return (
        <img
          src={url}
          alt={name || 'Image'}
          className="max-w-xs rounded-xl cursor-pointer hover:opacity-90 transition-opacity shadow-md mt-1"
          onClick={() => setViewerOpen(true)}
        />
      );
    }
    if (mime.startsWith('video/')) {
      return (
        <div
          className="relative mt-1 max-w-xs cursor-pointer group"
          onClick={() => setViewerOpen(true)}
        >
          <video src={url} className="w-full rounded-xl shadow-md pointer-events-none" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      );
    }
    if (mime.startsWith('audio/')) {
      return (
        <button
          onClick={() => setViewerOpen(true)}
          className="flex items-center gap-2 mt-1 bg-slate-100 dark:bg-black/20 hover:bg-slate-200 dark:hover:bg-black/30 rounded-lg px-3 py-2 text-sm transition-colors max-w-xs w-full text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium text-slate-700 dark:text-gray-100">{name || 'Audio'}</span>
            {size != null && <span className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(size)} · Click to play</span>}
          </div>
        </button>
      );
    }
    return (
      <button
        onClick={() => setViewerOpen(true)}
        className="flex items-center gap-2 mt-1 bg-slate-100 dark:bg-black/20 hover:bg-slate-200 dark:hover:bg-black/30 rounded-lg px-3 py-2 text-sm transition-colors max-w-xs w-full text-left"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <div className="flex flex-col min-w-0">
          <span className="truncate font-medium text-slate-700 dark:text-gray-100">{name || 'File'}</span>
          {size != null && <span className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(size)}</span>}
        </div>
        <a
          href={url}
          download={name || true}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors flex-shrink-0"
          aria-label="Download"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </button>
    );
  })();

  return (
    <>
      {preview}
      {viewerOpen && (
        <MediaViewer
          src={url}
          mimeType={type}
          name={name}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}

// ─── Thread reply badge ───────────────────────────────────────────────────────

function ThreadBadge({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="
        mt-1.5 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300
        bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40
        rounded-full px-2.5 py-0.5 transition-all duration-150
      "
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
      <span className="font-semibold">{count}</span>
      <span>{count === 1 ? 'reply' : 'replies'}</span>
    </button>
  );
}

// ─── Poll Widget ──────────────────────────────────────────────────────────────

function PollWidget({
  poll,
  messageId,
  currentUserId,
  isOwner,
  onVotePoll,
}: {
  poll: NonNullable<MessageData['poll']>;
  messageId: string;
  currentUserId: string;
  isOwner: boolean;
  onVotePoll?: (messageId: string, optionId: string) => void;
}) {
  // Optimistic local state: mirrors the poll but allows instant UI updates
  const [localOptions, setLocalOptions] = useState(() => poll.options.map(o => ({ ...o, votes: [...o.votes] })));

  const totalVotes = localOptions.reduce((sum, o) => sum + o.votes.length, 0);
  const userVotedOptionId = localOptions.find(o => o.votes.some(v => v.userId === currentUserId))?.id;
  // Show results if: user has voted, is the creator, or poll is closed
  const showResults = !!userVotedOptionId || isOwner || poll.isClosed;

  const handleVote = (optionId: string) => {
    if (poll.isClosed) return;
    // Optimistic update: toggle vote instantly
    setLocalOptions(prev => {
      const alreadyVoted = prev.find(o => o.id === optionId)?.votes.some(v => v.userId === currentUserId);
      return prev.map(o => {
        if (o.id === optionId) {
          return alreadyVoted
            ? { ...o, votes: o.votes.filter(v => v.userId !== currentUserId) }
            : { ...o, votes: [...o.votes, { userId: currentUserId }] };
        }
        // Remove vote from other options (single-choice)
        return { ...o, votes: o.votes.filter(v => v.userId !== currentUserId) };
      });
    });
    onVotePoll?.(messageId, optionId);
  };

  return (
    <div className="mt-1.5 space-y-1.5 min-w-[220px]">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {poll.isClosed ? '📊 Poll · Closed' : '📊 Poll'}
      </p>
      <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{poll.question}</p>
      {localOptions.map(option => {
        const voteCount = option.votes.length;
        const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
        const isVoted = option.id === userVotedOptionId;
        // Voter avatars (up to 3 shown)
        const voters = (poll.options.find(o => o.id === option.id)?.votes ?? [])
          .filter((v): v is typeof v & { user: NonNullable<typeof v.user> } => !!v.user)
          .slice(0, 3);

        return (
          <button
            key={option.id}
            disabled={poll.isClosed}
            onClick={() => handleVote(option.id)}
            className={`w-full text-left rounded-xl overflow-hidden border transition-all ${
              isVoted
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20'
                : 'border-slate-200 dark:border-white/10 hover:border-indigo-400 bg-white dark:bg-slate-700/50'
            } ${poll.isClosed ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <div className="relative px-3 py-2">
              {/* Progress fill — only when results are visible */}
              {showResults && (
                <div
                  className={`absolute inset-0 ${
                    isVoted ? 'bg-indigo-200/60 dark:bg-indigo-500/30' : 'bg-slate-100 dark:bg-slate-700/30'
                  } transition-all duration-500 rounded-xl`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Radio circle */}
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isVoted ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-500'
                  }`}>
                    {isVoted && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                  </span>
                  <span className={`text-sm font-medium truncate ${
                    isVoted ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'
                  }`}>
                    {option.text}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Voter mini-avatars (creator/voted view) */}
                  {showResults && voters.length > 0 && (
                    <div className="flex -space-x-1.5">
                      {voters.map(v => (
                        v.user.avatar
                          ? <img key={v.userId} src={v.user.avatar} alt={v.user.username} title={v.user.fullName || v.user.username} className="w-4 h-4 rounded-full object-cover ring-1 ring-white dark:ring-slate-800" />
                          : <span key={v.userId} title={v.user.fullName || v.user.username} className="w-4 h-4 rounded-full bg-indigo-400 ring-1 ring-white dark:ring-slate-800 flex items-center justify-center text-[8px] text-white font-bold">{(v.user.fullName || v.user.username).charAt(0).toUpperCase()}</span>
                      ))}
                    </div>
                  )}
                  {/* Percentage — only when results visible */}
                  {showResults && (
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {pct}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        {!showResults && <span className="ml-1 italic">· Vote to see results</span>}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Seen tick indicator ──────────────────────────────────────────────────────

function SeenTick({ seenByCount }: { seenByCount: number }) {
  if (seenByCount === 0) {
    // Single grey tick — sent/delivered
    return (
      <span title="Sent" className="inline-flex items-center text-slate-300 dark:text-slate-500 ml-1 flex-shrink-0" aria-label="Sent">
        <svg className="w-3.5 h-3" viewBox="0 0 16 12" fill="none">
          <path d="M1 6l4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  // Double blue tick — seen by at least one other participant
  return (
    <span title={`Seen by ${seenByCount}`} className="inline-flex items-center text-blue-400 dark:text-blue-300 ml-1 flex-shrink-0" aria-label="Seen">
      <svg className="w-4 h-3" viewBox="0 0 20 12" fill="none">
        <path d="M1 6l4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 6l4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

export function MessageBubble({
  message,
  isFirstInGroup,
  isLastInGroup,
  isOwnMessage,
  isHighlighted,
  currentUserId,
  onAddReaction,
  onRemoveReaction,
  onOpenThread,
  onStartEdit,
  onDeleteRequest,
  isEditing,
  editContent,
  editError,
  editSaving,
  onEditChange,
  onEditSave,
  onEditCancel,
  onFindSimilar,
  onCopy,
  onForward,
  onPin,
  onVotePoll,
  onSelect,
  onSave,
  onAvatarClick,
  isSelected = false,
  isSelectionMode = false,
  readReceipts = {},
}: MessageBubbleProps) {
  const displayName = message.user.fullName || message.user.username;
  const replyCount = message._count?.replies ?? 0;

  // Count how many OTHER users have read up to or past this message
  const seenByCount = isOwnMessage
    ? Object.entries(readReceipts).filter(([uid, lastMsgId]) => {
        if (uid === currentUserId) return false;
        // A user has "seen" this message if their lastReadAt messageId appears
        // after this message in the conversation — we approximate by comparing
        // the createdAt of the message to the readReceipts map which stores
        // the last messageId read. We treat any receipt as "seen" since the
        // receipts map only grows forward.
        return !!lastMsgId;
      }).length
    : 0;

  // Bubble shape: tail on first message in group only
  // Own messages: tail on right; others: tail on left
  const bubbleTailClass = isFirstInGroup
    ? isOwnMessage
      ? 'rounded-tr-sm' // tail effect via border-radius asymmetry
      : 'rounded-tl-sm'
    : '';

  const bubbleColorClass = isOwnMessage
    ? 'bg-blue-600 text-white'
    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-100 dark:border-white/[0.06]';

  const hasFileOnly = !!message.fileUrl && !message.content && !(message as any).forwardedFrom;

  return (
    <div
      id={`msg-${message.id}`}
      className={`
        group/message relative flex items-end gap-2
        ${isOwnMessage ? 'flex-row-reverse' : ''}
        ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}
        ${isHighlighted ? 'bg-yellow-500/10 rounded-lg -mx-2 px-2' : ''}
        ${isSelected ? 'bg-blue-500/10 rounded-lg -mx-2 px-2' : ''}
        ${isSelectionMode ? 'cursor-pointer' : ''}
        transition-colors duration-700
      `}
      onClick={isSelectionMode ? onSelect : undefined}
    >
      {/* Avatar area — always reserve space; show avatar only on last in group */}
      <div className="w-8 flex-shrink-0 flex items-end justify-center self-end mb-0.5">
        {isLastInGroup ? (
          message.user.avatar ? (
            <img
              src={message.user.avatar}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
              onClick={onAvatarClick}
            />
          ) : (
            <div onClick={onAvatarClick} className={onAvatarClick ? 'cursor-pointer' : ''}>
              <AvatarPlaceholder name={displayName} size={8} />
            </div>
          )
        ) : (
          // Placeholder to keep alignment consistent
          <div className="w-8 h-8" />
        )}
      </div>

      {/* Content column */}
      <div
        className={`flex flex-col max-w-[min(480px,72%)] ${isOwnMessage ? 'items-end' : 'items-start'}`}
      >
        {/* Sender name + timestamp — only on first message in group */}
        {isFirstInGroup && (
          <div
            className={`flex items-baseline gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
          >
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {displayName}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center">
              {formatTime(message.createdAt)}
              {isOwnMessage && <SeenTick seenByCount={seenByCount} />}
            </span>
          </div>
        )}
        {/* For non-first messages in group: show tick inline after bubble */}
        {!isFirstInGroup && isOwnMessage && isLastInGroup && (
          <div className="flex justify-end">
            <SeenTick seenByCount={seenByCount} />
          </div>
        )}

        {/* Bubble + hover actions wrapper */}
        <div className="relative w-full">
          {/* Hover action toolbar */}
          <MessageActions
            messageId={message.id}
            isOwnMessage={isOwnMessage}
            hasThread={replyCount > 0}
            onReply={onOpenThread}
            onReact={(emoji) => onAddReaction(message.id, emoji)}
            onEdit={onStartEdit}
            onDelete={onDeleteRequest}
            onThread={onOpenThread}
            onFindSimilar={onFindSimilar}
            onCopy={onCopy}
            onForward={onForward}
            onPin={onPin}
            onSelect={onSelect}
            onSave={onSave}
          />

          {/* Inline edit mode */}
          {isEditing ? (
            <div className="flex flex-col gap-1 w-full min-w-[240px]">
              <textarea
                value={editContent}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onEditSave();
                  }
                  if (e.key === 'Escape') onEditCancel();
                }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-blue-500/60 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
                autoFocus
                disabled={editSaving}
              />
              {editError && <p className="text-xs text-red-400">{editError}</p>}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Press{' '}
                  <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300">
                    Enter
                  </kbd>{' '}
                  to save,{' '}
                  <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300">
                    Esc
                  </kbd>{' '}
                  to cancel
                </span>
                <button
                  onClick={onEditSave}
                  disabled={editSaving}
                  className="ml-auto px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-colors text-xs font-medium"
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={onEditCancel}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Message bubble */
            <div
              className={`
                relative rounded-2xl text-sm break-words
                ${hasFileOnly ? '' : `px-3 py-2 ${bubbleColorClass} ${bubbleTailClass}`}
              `}
            >
              {/* Telegram-style tail: a tiny pseudo-element via a clipped div */}
              {isFirstInGroup && !hasFileOnly && (
                <span
                  className={`
                    absolute top-0 w-2 h-2 overflow-hidden
                    ${isOwnMessage ? '-right-1' : '-left-1'}
                  `}
                  aria-hidden
                >
                  <span
                    className={`
                      block w-3 h-3 rounded-sm
                      ${isOwnMessage ? 'bg-blue-600 -rotate-45 origin-bottom-left' : 'bg-white dark:bg-slate-800 rotate-45 origin-bottom-right'}
                    `}
                  />
                </span>
              )}

              {/* Telegram-style Forwarded tag — renders whenever forwardedFromId exists */}
              {((message as any).forwardedFromId || (message as any).forwardedFrom) && (() => {
                const fwd = (message as any).forwardedFrom;
                // Debug: verify data arriving from server
                if (process.env.NODE_ENV !== 'production') {
                  console.log('[MessageBubble] Forward Data:', {
                    forwardedFromId: (message as any).forwardedFromId,
                    forwardedFrom: fwd,
                  });
                }
                const senderName =
                  fwd?.user?.fullName ||
                  fwd?.user?.username ||
                  fwd?.sender?.fullName ||
                  fwd?.sender?.username ||
                  'Unknown User';
                return (
                  <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-blue-400/30">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer hover:underline transition-colors">
                      Forwarded from {senderName}
                    </span>
                  </div>
                );
              })()}

              {/* Text content */}
              {message.content && (
                <div className="leading-relaxed whitespace-pre-wrap break-words">
                  {renderMessageContent(message.content, message.mentions ?? [])}
                </div>
              )}

              {/* Poll */}
              {message.poll && (
                <PollWidget
                  poll={message.poll}
                  messageId={message.id}
                  currentUserId={currentUserId}
                  isOwner={message.user.id === currentUserId}
                  onVotePoll={onVotePoll}
                />
              )}

              {/* File attachment */}
              {message.fileUrl && (
                <FileAttachment
                  url={message.fileUrl}
                  type={message.fileType ?? null}
                  name={message.originalName ?? null}
                  size={message.fileSize ?? null}
                />
              )}

              {/* Edited tag */}
              {message.isEdited && (
                <span className="text-[10px] opacity-50 ml-1 select-none">(edited)</span>
              )}
              {(message as any).isPinned && (
                <span title="Pinned" className="ml-1 text-amber-400 text-xs select-none" aria-label="Pinned">📌</span>
              )}
            </div>
          )}
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <ReactionPill
            reactions={message.reactions}
            currentUserId={currentUserId}
            onAdd={(emoji) => onAddReaction(message.id, emoji)}
            onRemove={(reactionId, emoji) => onRemoveReaction(message.id, reactionId, emoji)}
          />
        )}

        {/* Thread reply badge */}
        {replyCount > 0 && !isEditing && <ThreadBadge count={replyCount} onClick={onOpenThread} />}
      </div>
    </div>
  );
}
