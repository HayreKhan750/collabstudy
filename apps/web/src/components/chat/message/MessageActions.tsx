'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  /** Copy message text to clipboard */
  onCopy?: () => void;
  /** Forward message to another channel/DM */
  onForward?: () => void;
  /** Pin message in channel */
  onPin?: () => void;
  /** Toggle select mode for this message */
  onSelect?: () => void;
  /** Save/bookmark this message */
  onSave?: () => void;
}

// 5 columns × 8 rows = 40 emojis
const QUICK_EMOJIS = [
  '👍', '❤️', '😂', '🔥', '🎉',
  '👀', '😢', '🚀', '💯', '✨',
  '😮', '🙏', '😍', '🤔', '😎',
  '🥳', '😅', '🤣', '😊', '😭',
  '💪', '🙌', '👏', '🤝', '💀',
  '⚡', '🌟', '💡', '🎯', '🏆',
  '😡', '🤯', '🥺', '😴', '🤗',
  '👋', '✅', '❌', '⚠️', '💬',
];

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
          p-1.5 rounded-md transition-all duration-150
          active:scale-90 active:opacity-70
          ${
            danger
              ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 active:bg-red-100 dark:active:bg-red-500/20'
              : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 active:bg-slate-200 dark:active:bg-white/20'
          }
        `}
      >
        {children}
      </button>
    </Tooltip>
  );
}

// ─── Picker portal position ───────────────────────────────────────────────────
interface PickerPos {
  top: number;
  left: number;
  openUpward: boolean;
  openLeftward: boolean;
}

const PICKER_W = 176; // px — matches w-[176px] below
const PICKER_H = 200; // approximate picker height in px

function calcPickerPos(btn: HTMLButtonElement): PickerPos {
  const r = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const MARGIN = 8;

  // Vertical: prefer above the toolbar button; flip below if not enough room
  const openUpward = r.top - PICKER_H - MARGIN > 0;
  const top = openUpward
    ? r.top - PICKER_H - MARGIN + window.scrollY
    : r.bottom + MARGIN + window.scrollY;

  // Horizontal: align to right edge of button; flip left if would overflow
  const openLeftward = r.right - PICKER_W < MARGIN;
  const left = openLeftward
    ? r.left + window.scrollX
    : r.right - PICKER_W + window.scrollX;

  // Clamp within viewport
  const clampedLeft = Math.max(MARGIN, Math.min(left, vw - PICKER_W - MARGIN));

  return { top, left: clampedLeft, openUpward, openLeftward };
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
  onCopy,
  onForward,
  onPin,
  onSelect,
  onSave,
}: MessageActionsProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState<PickerPos | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Recalculate position on open + on scroll/resize
  const openPicker = useCallback(() => {
    if (!emojiButtonRef.current) return;
    setPickerPos(calcPickerPos(emojiButtonRef.current));
    setShowEmojiPicker(true);
  }, []);

  const closePicker = useCallback(() => {
    setShowEmojiPicker(false);
    setPickerPos(null);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        pickerRef.current && !pickerRef.current.contains(target) &&
        emojiButtonRef.current && !emojiButtonRef.current.contains(target)
      ) {
        closePicker();
      }
    };
    // Close on scroll too (picker position would be stale)
    const onScroll = () => closePicker();
    document.addEventListener('mousedown', handler);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [showEmojiPicker, closePicker]);

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
      {/* Quick emoji picker — portal-based for overflow escape + smart positioning */}
      <div className="relative">
        <Tooltip label="Add Reaction">
          <button
            ref={emojiButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              showEmojiPicker ? closePicker() : openPicker();
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-violet-500 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all duration-150"
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

        {/* Portal picker — attached to document.body, escapes all overflow constraints */}
        {showEmojiPicker && pickerPos && typeof document !== 'undefined' && createPortal(
          <div
            ref={pickerRef}
            style={{
              position: 'fixed',
              top: pickerPos.top,
              left: pickerPos.left,
              zIndex: 9999,
              width: PICKER_W,
            }}
            className="
              bg-white/95 dark:bg-[#0a051e]/95 backdrop-blur-xl
              border border-gray-200 dark:border-white/[0.07]
              rounded-2xl px-2 py-2
              shadow-[0_8px_40px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]
              animate-scale-in
            "
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search hint row */}
            <p className="text-[10px] text-slate-400 dark:text-violet-300/40 text-center mb-1.5 leading-none select-none">
              Quick reactions
            </p>
            <div className="grid grid-cols-5 gap-0.5">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact?.(emoji);
                    closePicker();
                  }}
                  className="
                    text-[18px] leading-none p-1.5 rounded-lg
                    hover:scale-125 hover:bg-violet-50 dark:hover:bg-violet-500/15
                    active:scale-95
                    transition-all duration-100
                    flex items-center justify-center
                  "
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>,
          document.body,
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

      {/* Copy */}
      {onCopy && (
        <ActionButton onClick={onCopy} title="Copy Text">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </ActionButton>
      )}

      {/* Forward */}
      {onForward && (
        <ActionButton onClick={onForward} title="Forward Message">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </ActionButton>
      )}

      {/* Pin */}
      {onPin && (
        <ActionButton onClick={onPin} title="Pin Message">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </ActionButton>
      )}

      {/* Select */}
      {onSelect && (
        <ActionButton onClick={onSelect} title="Select Message">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </ActionButton>
      )}

      {/* Save/Bookmark — with flash feedback */}
      {onSave && (
        <Tooltip label={savedFlash ? 'Saved!' : 'Save Message'}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (savedFlash) return;
              setSavedFlash(true);
              setTimeout(() => setSavedFlash(false), 1800);
              onSave();
            }}
            className={`
              p-1.5 rounded-md transition-all duration-150 active:scale-90 active:opacity-70
              ${savedFlash
                ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/15'
                : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 active:bg-indigo-100 dark:active:bg-indigo-500/20'
              }
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill={savedFlash ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </Tooltip>
      )}

      {/* Delete (own messages only) */}
      {isOwnMessage && onDelete && (
        <ActionButton onClick={onDelete} title="Delete Message" danger>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </ActionButton>
      )}
    </div>
  );
}
