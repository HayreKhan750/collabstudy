'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api, SearchResult } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  onSelectResult: (channelId: string, messageId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getInitial(user: { username: string; fullName?: string | null }): string {
  return (user.fullName || user.username)[0].toUpperCase();
}

// Highlight matched query inside text — wraps matches in a styled span
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-violet-200 dark:bg-violet-500/40 text-violet-900 dark:text-violet-100 rounded px-0.5 not-italic">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// Group results by channel
function groupByChannel(results: SearchResult[]): Map<string, SearchResult[]> {
  const map = new Map<string, SearchResult[]>();
  for (const r of results) {
    const key = r.channelId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

// Flat index for keyboard navigation
function flattenGroups(groups: Map<string, SearchResult[]>): SearchResult[] {
  const flat: SearchResult[] = [];
  for (const results of groups.values()) {
    for (const r of results) flat.push(r);
  }
  return flat;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SearchModal({ isOpen, onClose, workspaceId, token, onSelectResult }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setError(null);
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchMessages(token, { q, workspaceId, limit: 30 });
      setResults(res.messages);
      setActiveIndex(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const flat = flattenGroups(groupByChannel(results));

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, flat.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && flat.length > 0) {
        e.preventDefault();
        const selected = flat[activeIndex];
        if (selected) {
          onSelectResult(selected.channelId, selected.id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, results, activeIndex, onClose, onSelectResult]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const groups = groupByChannel(results);
  const flat = flattenGroups(groups);
  let flatIdx = 0; // rolling counter across groups

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search messages"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '75vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.06]">
          {/* Search icon */}
          <svg className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-base focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />

          {/* Loading spinner */}
          {loading && (
            <svg className="w-4 h-4 text-violet-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}

          {/* Kbd hint */}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
            Esc
          </kbd>
        </div>

        {/* Results area */}
        <div ref={listRef} className="overflow-y-auto overscroll-contain">
          {/* Empty / idle state */}
          {!loading && query.trim().length < 2 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500 gap-3">
              <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <p className="text-sm">Type at least 2 characters to search</p>
              <div className="flex items-center gap-2 text-xs text-slate-300 dark:text-slate-600">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">↑</kbd>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">↵</kbd>
                  select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Esc</kbd>
                  close
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-8 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
          )}

          {/* No results */}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 dark:text-slate-500">
              <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No messages found for <strong className="text-slate-600 dark:text-slate-300">"{query}"</strong></p>
              <p className="text-xs">Try a different keyword or check the workspace.</p>
            </div>
          )}

          {/* Grouped results */}
          {results.length > 0 && (
            <div className="py-2">
              {Array.from(groups.entries()).map(([channelId, msgs]) => {
                const channelName = msgs[0].channelName;
                return (
                  <div key={channelId}>
                    {/* Channel group header */}
                    <div className="flex items-center gap-2 px-4 py-2 sticky top-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm z-10">
                      <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {channelName}
                      </span>
                      <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.06]" />
                      <span className="text-[10px] text-slate-300 dark:text-slate-600">{msgs.length} result{msgs.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Results in this channel */}
                    {msgs.map(result => {
                      const idx = flatIdx++;
                      const isActive = idx === activeIndex;
                      const displayName = result.user.fullName || result.user.username;
                      const initial = getInitial(result.user);

                      return (
                        <button
                          key={result.id}
                          data-idx={idx}
                          onClick={() => {
                            onSelectResult(result.channelId, result.id);
                            onClose();
                          }}
                          className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-100 ${
                            isActive
                              ? 'bg-violet-50 dark:bg-violet-500/10 border-l-2 border-l-violet-500'
                              : 'hover:bg-slate-50 dark:hover:bg-white/[0.04] border-l-2 border-l-transparent'
                          }`}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                            {result.user.avatar ? (
                              <img src={result.user.avatar} alt={displayName} className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              initial
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {displayName}
                              </span>
                              <span className="text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                                {formatTime(result.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                              <HighlightedText text={result.content} query={query} />
                            </p>
                          </div>

                          {/* Arrow indicator when active */}
                          {isActive && (
                            <svg className="w-4 h-4 text-violet-500 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {/* Footer hint */}
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {flat.length} result{flat.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-slate-300 dark:text-slate-600">
                  Press <kbd className="px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px]">↵</kbd> to jump
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
