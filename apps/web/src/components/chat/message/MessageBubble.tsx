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

// ─── Main Component ───────────────────────────────────────────────────────────

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
}: MessageBubbleProps) {
  const displayName = message.user.fullName || message.user.username;
  const replyCount = message._count?.replies ?? 0;

  // Bubble shape: tail on first message in group only
  // Own messages: tail on right; others: tail on left
  const bubbleTailClass = isFirstInGroup
    ? isOwnMessage
      ? 'rounded-tr-sm' // tail effect via border-radius asymmetry
      : 'rounded-tl-sm'
    : '';

  const bubbleColorClass = isOwnMessage
    ? 'bg-blue-600 text-white'
    : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm';

  const hasFileOnly = !!message.fileUrl && !message.content;

  return (
    <div
      id={`msg-${message.id}`}
      className={`
        group/message relative flex items-end gap-2
        ${isOwnMessage ? 'flex-row-reverse' : ''}
        ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}
        ${isHighlighted ? 'bg-yellow-500/10 rounded-lg -mx-2 px-2' : ''}
        transition-colors duration-700
      `}
    >
      {/* Avatar area — always reserve space; show avatar only on last in group */}
      <div className="w-8 flex-shrink-0 flex items-end justify-center self-end mb-0.5">
        {isLastInGroup ? (
          message.user.avatar ? (
            <img
              src={message.user.avatar}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <AvatarPlaceholder name={displayName} size={8} />
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
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {formatTime(message.createdAt)}
            </span>
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
                className="w-full bg-gray-100 dark:bg-gray-700 border border-blue-500/60 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
                autoFocus
                disabled={editSaving}
              />
              {editError && <p className="text-xs text-red-400">{editError}</p>}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 dark:text-gray-500">
                  Press{' '}
                  <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
                    Enter
                  </kbd>{' '}
                  to save,{' '}
                  <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
                    Esc
                  </kbd>{' '}
                  to cancel
                </span>
                <button
                  onClick={onEditSave}
                  disabled={editSaving}
                  className="ml-auto px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50 transition-colors"
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={onEditCancel}
                  className="px-2.5 py-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition-colors"
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
                      ${isOwnMessage ? 'bg-blue-600 -rotate-45 origin-bottom-left' : 'bg-white dark:bg-slate-700 rotate-45 origin-bottom-right'}
                    `}
                  />
                </span>
              )}

              {/* Text content */}
              {message.content && (
                <div className="leading-relaxed">
                  {renderMessageContent(message.content, message.mentions ?? [])}
                </div>
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
