'use client';

import { useState, useRef, useEffect } from 'react';

interface MessageActionsProps {
  messageId: string;
  isOwnMessage: boolean;
  hasThread: boolean;
  onReply?: () => void;
  onReact?: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onThread?: () => void;
  /** Phase 11.3: opens the Related Messages panel for this message */
  onFindSimilar?: () => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '👀', '😢', '🚀', '💯', '✨', '😮', '🙏'];

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 bg-slate-800 dark:bg-slate-950 text-slate-100 text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-50 border border-slate-700">
        {label}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  title,
  children,
  danger,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Tooltip label={title}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={`
          p-1.5 rounded-md transition-colors duration-150
          ${
            danger
              ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
              : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
          }
        `}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function MessageActions({
  messageId,
  isOwnMessage,
  hasThread,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onThread,
  onFindSimilar,
}: MessageActionsProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  return (
    <div
      className="
        absolute -top-4 right-2 z-20
        flex items-center gap-0.5
        bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl
        px-1 py-0.5
        opacity-0 group-hover/message:opacity-100
        transition-opacity duration-150
        pointer-events-none group-hover/message:pointer-events-auto
      "
      onClick={(e) => e.stopPropagation()}
    >
      {/* Quick emoji picker */}
      <div className="relative" ref={pickerRef}>
        <Tooltip label="Add Reaction">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowEmojiPicker((v) => !v);
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors duration-150"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </Tooltip>
        {showEmojiPicker && (
          <div className="absolute bottom-full right-0 mb-2 flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 shadow-xl z-30">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  onReact?.(emoji);
                  setShowEmojiPicker(false);
                }}
                className="text-lg hover:scale-125 transition-transform duration-100 leading-none"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reply */}
      {onReply && (
        <ActionButton onClick={onReply} title="Reply in Thread">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
        </ActionButton>
      )}

      {/* "Open Thread" button intentionally removed — consolidated into "Reply in Thread" above */}

      {/* Find Similar — Phase 11.3 AI Smart Suggestions */}
      {onFindSimilar && (
        <Tooltip label="Find Similar">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFindSimilar();
            }}
            className="p-1.5 rounded-md transition-colors duration-150 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"
          >
            {/* Sparkle / AI icon */}
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </button>
        </Tooltip>
      )}

      {/* Edit (own messages only) */}
      {isOwnMessage && onEdit && (
        <ActionButton onClick={onEdit} title="Edit Message">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </ActionButton>
      )}

      {/* Delete (own messages only) */}
      {isOwnMessage && onDelete && (
        <ActionButton onClick={onDelete} title="Delete Message" danger>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </ActionButton>
      )}
    </div>
  );
}
