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

type SearchMode = 'keyword' | 'semantic';

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

// Highlight matched query inside text — only meaningful in keyword mode
function HighlightedText({ text, query, highlight }: { text: string; query: string; highlight: boolean }) {
  if (!highlight || !query.trim()) return <>{text}</>;
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

// ─── Search Mode Toggle ───────────────────────────────────────────────────────

function SearchModeToggle({
  mode,
  onChange,
}: {
  mode: SearchMode;
  onChange: (m: SearchMode) => void;
}) {
  return (
    <div className="flex items-center justify-center px-4 pt-1 pb-2.5">
      <div className="relative flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl p-1 gap-0 shadow-inner w-full max-w-xs">
        {/* Sliding pill — absolutely positioned, transitions between left/right */}
        <span
          className={`absolute top-1 bottom-1 rounded-lg bg-white dark:bg-slate-700 shadow-sm transition-all duration-200 ease-out ${
            mode === 'keyword' ? 'left-1 right-[50%]' : 'left-[50%] right-1'
          }`}
          aria-hidden="true"
        />

        {/* Keyword button */}
        <button
          type="button"
          onClick={() => onChange('keyword')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 select-none ${
            mode === 'keyword'
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {/* Keyword icon — magnifying glass */}
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          Keyword
        </button>

        {/* Semantic button */}
        <button
          type="button"
          onClick={() => onChange('semantic')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 select-none ${
            mode === 'semantic'
              ? 'text-violet-700 dark:text-violet-300'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {/* Semantic icon — sparkle / AI */}
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Semantic
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SearchModal({ isOpen, onClose, workspaceId, token, onSelectResult }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('keyword');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchMode, setSearchMode] = useState<string | undefined>(undefined);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens; reset state
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setError(null);
      setActiveIndex(0);
      setSearchMode(undefined);
    }
  }, [isOpen]);

  // Re-run search when mode changes (if there's already a query)
  useEffect(() => {
    if (query.trim().length >= 2) {
      doSearch(query, mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const doSearch = useCallback(async (q: string, currentMode: SearchMode) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (currentMode === 'semantic') {
        const res = await api.hybridSearchMessages(token, { q, workspaceId, limit: 30 });
        setResults(res.messages);
        setSearchMode(res.searchMode);
      } else {
        const res = await api.searchMessages(token, { q, workspaceId, limit: 30 });
        setResults(res.messages);
        setSearchMode(undefined);
      }
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
    debounceRef.current = setTimeout(() => doSearch(val, mode), 300);
  };

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    setResults([]);
    setSearchMode(undefined);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const flat = flattenGroups(groupByChannel(results));

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flat.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && flat.length > 0) {
        e.preventDefault();
        const selected = flat[activeIndex];
        if (selected) { onSelectResult(selected.channelId, selected.id); onClose(); }
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
  let flatIdx = 0;

  return (
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
          <svg className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder={mode === 'semantic' ? 'Ask anything about your messages…' : 'Search messages…'}
            className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-base focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />

          {loading && (
            <svg className="w-4 h-4 text-violet-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}

          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
            Esc
          </kbd>
        </div>

        {/* Mode toggle — sits below the search bar, above results */}
        <div className="border-b border-slate-100 dark:border-white/[0.06] pt-2">
          <SearchModeToggle mode={mode} onChange={handleModeChange} />
        </div>

        {/* Results area */}
        <div ref={listRef} className="overflow-y-auto overscroll-contain">

          {/* Empty / idle state */}
          {!loading && query.trim().length < 2 && (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-slate-500 gap-3">
              {mode === 'semantic' ? (
                <>
                  <svg className="w-10 h-10 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <p className="text-sm font-medium">Semantic Search</p>
                  <p className="text-xs text-center max-w-xs leading-relaxed">
                    Finds messages by meaning, not just keywords.<br />
                    Try: <em className="text-slate-500 dark:text-slate-400">"deadline for the project"</em>
                  </p>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <p className="text-sm">Type at least 2 characters to search</p>
                </>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-300 dark:text-slate-600 mt-1">
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
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400 dark:text-slate-500">
              <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No messages found for <strong className="text-slate-600 dark:text-slate-300">"{query}"</strong></p>
              {mode === 'semantic' && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Try switching to <strong>Keyword</strong> search, or rephrase your query.
                </p>
              )}
            </div>
          )}

          {/* Grouped results */}
          {results.length > 0 && (
            <div className="py-2">
              {/* Fallback indicator — only shown when semantic was requested but fell back */}
              {mode === 'semantic' && searchMode === 'trigram-fallback' && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    Semantic engine unavailable — showing keyword results
                  </span>
                </div>
              )}

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
                          onClick={() => { onSelectResult(result.channelId, result.id); onClose(); }}
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
                              {/* Semantic badge — only shown in semantic mode for actual hybrid results */}
                              {mode === 'semantic' && searchMode === 'hybrid' && (
                                <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300">
                                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                  </svg>
                                  AI
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                              <HighlightedText
                                text={result.content}
                                query={query}
                                highlight={mode === 'keyword'}
                              />
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

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {flat.length} result{flat.length !== 1 ? 's' : ''}
                  {mode === 'semantic' && searchMode === 'hybrid' && (
                    <span className="ml-1.5 text-violet-500 dark:text-violet-400">· AI-ranked</span>
                  )}
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
