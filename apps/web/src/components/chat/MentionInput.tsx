'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MentionUser } from '@/lib/api';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (mentionIds: string[]) => void;
  onTyping?: () => void;
  members: MentionUser[];
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** When true, allows sending even if the text input is empty (e.g. file-only messages). */
  hasPendingFile?: boolean;
}

export default function MentionInput({
  value,
  onChange,
  onSend,
  onTyping,
  members,
  placeholder = 'Type a message…',
  disabled = false,
  inputRef: externalRef,
  hasPendingFile = false,
}: MentionInputProps) {
  /** Currently accumulated mention IDs for this message. */
  const [mentionIds, setMentionIds] = useState<string[]>([]);

  /** The fragment the user typed after the last unresolved '@'. */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  /** Whether the autocomplete popover is open. */
  const [showPopover, setShowPopover] = useState(false);

  /** Index of the highlighted item in the popover. */
  const [highlightIndex, setHighlightIndex] = useState(0);

  const internalRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = (externalRef as React.RefObject<HTMLTextAreaElement>) ?? internalRef;

  // ─── Derive filtered member list ─────────────────────────────────────────

  const filtered =
    mentionQuery === null
      ? []
      : members.filter((m) =>
          m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
          (m.fullName ?? '').toLowerCase().startsWith(mentionQuery.toLowerCase()),
        );

  // ─── Reset highlight when query/list changes ─────────────────────────────

  useEffect(() => {
    setHighlightIndex(0);
  }, [mentionQuery]);

  // ─── Close popover on outside click ─────────────────────────────────────

  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-mention-popover]')) {
        setShowPopover(false);
        setMentionQuery(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  // ─── Handle input change ──────────────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    onTyping?.();

    // Find the last '@' that hasn't been followed by a space
    const cursor = e.target.selectionStart ?? val.length;
    const textUpToCursor = val.slice(0, cursor);
    const atIdx = textUpToCursor.lastIndexOf('@');

    if (atIdx !== -1) {
      const fragment = textUpToCursor.slice(atIdx + 1);
      if (!fragment.includes(' ')) {
        setMentionQuery(fragment);
        setShowPopover(true);
        return;
      }
    }

    setMentionQuery(null);
    setShowPopover(false);
  };

  // ─── Select a member from the popover ────────────────────────────────────

  const selectMember = useCallback(
    (member: MentionUser) => {
      const cursor = activeRef.current?.selectionStart ?? value.length;
      const textUpToCursor = value.slice(0, cursor);
      const atIdx = textUpToCursor.lastIndexOf('@');

      // Replace "@<fragment>" with "@username "
      const newValue =
        value.slice(0, atIdx) + `@${member.username} ` + value.slice(cursor);

      onChange(newValue);

      // Track unique mention IDs
      setMentionIds((prev) =>
        prev.includes(member.id) ? prev : [...prev, member.id],
      );

      setShowPopover(false);
      setMentionQuery(null);

      // Re-focus + move cursor to end of inserted mention
      setTimeout(() => {
        if (activeRef.current) {
          activeRef.current.focus();
          const pos = atIdx + member.username.length + 2; // "@username "
          activeRef.current.setSelectionRange(pos, pos);
        }
      }, 0);
    },
    [value, onChange, activeRef],
  );

  // ─── Keyboard navigation ──────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPopover && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMember(filtered[highlightIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowPopover(false);
        setMentionQuery(null);
        return;
      }
    }

    // Normal send on Enter (no popover active)
    if (e.key === 'Enter' && !e.shiftKey && !showPopover) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Send ─────────────────────────────────────────────────────────────────

  const handleSend = () => {
    if ((!value.trim() && !hasPendingFile) || disabled) return;
    onSend(mentionIds);
    setMentionIds([]);
    setShowPopover(false);
    setMentionQuery(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative" data-mention-popover>
      {/* Autocomplete popover */}
      {showPopover && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white/90 dark:bg-[#0a051e]/90 backdrop-blur-xl border border-gray-200 dark:border-white/[0.06] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden z-50">
          <div className="px-3 py-1.5 text-xs text-slate-500 dark:text-violet-300/60 border-b border-gray-100 dark:border-white/[0.06]">
            Members — ↑↓ navigate · Enter select
          </div>
          <ul>
            {filtered.map((member, idx) => (
              <li key={member.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMember(member);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-all duration-150 ${
                    idx === highlightIndex
                      ? 'bg-violet-500/20 text-violet-100 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.3)]'
                      : 'text-slate-700 dark:text-violet-100/80 hover:bg-violet-500/10 dark:hover:bg-violet-400/10'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-sm">
                    {(member.fullName || member.username).charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">
                    <span className="font-medium">@{member.username}</span>
                    {member.fullName && (
                      <span className={`ml-1 text-xs ${idx === highlightIndex ? 'text-violet-300' : 'text-slate-400 dark:text-violet-300/50'}`}>{member.fullName}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          ref={activeRef}
          rows={1}
          value={value}
          onChange={(e) => {
            handleChange(e);
            // Auto-grow up to 5 lines
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 px-3 py-2 bg-transparent border-0 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-violet-300/30 focus:outline-none text-sm disabled:opacity-50 resize-none leading-relaxed transition-all duration-200"
          autoComplete="off"
          style={{ minHeight: '40px', maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          type="submit"
          disabled={(!value.trim() && !hasPendingFile) || disabled}
          className="p-2 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-[0_0_16px_rgba(139,92,246,0.4)] hover:shadow-[0_0_24px_rgba(139,92,246,0.6)] flex-shrink-0 mr-1 mb-0.5"
          aria-label="Send message"
          title="Send message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
