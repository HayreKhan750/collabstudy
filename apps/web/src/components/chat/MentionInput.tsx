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
  inputRef?: React.RefObject<HTMLInputElement | null>;
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

  const internalRef = useRef<HTMLInputElement>(null);
  const activeRef = (externalRef as React.RefObject<HTMLInputElement>) ?? internalRef;

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            Members — ↑↓ to navigate, Enter to select
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
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                    idx === highlightIndex
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                    {(member.fullName || member.username).charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">
                    <span className="font-medium">@{member.username}</span>
                    {member.fullName && (
                      <span className={`ml-1 text-xs ${idx === highlightIndex ? 'text-blue-200' : 'text-slate-400 dark:text-slate-400'}`}>{member.fullName}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={activeRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={(!value.trim() && !hasPendingFile) || disabled}
          className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center shadow-lg flex-shrink-0"
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
