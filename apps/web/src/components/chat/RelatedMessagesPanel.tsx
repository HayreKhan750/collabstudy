'use client';

import { useEffect, useRef, useState } from 'react';
import { api, SearchResult } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RelatedMessagesPanelProps {
  /** The message we're finding related results for */
  sourceMessage: {
    id: string;
    content: string | null;
    user: { username: string; fullName?: string | null };
  };
  workspaceId: string;
  token: string;
  onClose: () => void;
  /** Navigate to a specific message in a channel */
  onSelectResult: (channelId: string, messageId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | Date): string {
  const date = new Date(iso as string);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      return `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getInitial(name: string): string {
  return (name || '?')[0].toUpperCase();
}

/** Similarity score → pill colour and label */
function SimilarityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  let colorClass = 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
  if (pct < 70) colorClass = 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300';
  if (pct < 55) colorClass = 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${colorClass} flex-shrink-0`}>
      {pct}% match
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasEmbedding }: { hasEmbedding: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
        <svg className="w-7 h-7 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      {hasEmbedding ? (
        <>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No related messages found</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-[220px]">
            This message is unique! No other messages in this workspace discuss the same topic.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Still processing…</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">This may take a moment.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-[220px]">
            The AI embedding for this message is still being generated. Try again in a few seconds.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RelatedMessagesPanel({
  sourceMessage,
  workspaceId,
  token,
  onClose,
  onSelectResult,
}: RelatedMessagesPanelProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Fail-fast: stop polling after 15 seconds if embedding never appears
  const pollStartRef = useRef<number>(Date.now());
  const POLL_TIMEOUT_MS = 15_000;
  /** true if the source message returned an empty result due to missing embedding */
  const [hasEmbedding, setHasEmbedding] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResults([]);
    setHasEmbedding(true);

    // Fail-fast: stop polling after 15s if embedding never materializes
    if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
      setError('AI embeddings timed out. The message may not have been processed yet — try again shortly.');
      setLoading(false);
      return;
    }

    api
      .getRelatedMessages(token, { messageId: sourceMessage.id, workspaceId, limit: 8 })
      .then((res) => {
        if (cancelled) return;
        setResults(res.messages);
        // If backend returned 0 results but message might just have no embedding,
        // we don't know for sure — show the "still processing" state as a hint.
        // (The API returns total:0 both when no similar msgs exist AND when no embedding.)
        setHasEmbedding(res.total > 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load related messages');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sourceMessage.id, workspaceId, token]);

  const sourceName = sourceMessage.user.fullName || sourceMessage.user.username;
  const sourcePreview = sourceMessage.content
    ? sourceMessage.content.slice(0, 80) + (sourceMessage.content.length > 80 ? '…' : '')
    : '[attachment]';

  return (
    <aside className="
      flex flex-col h-full
      bg-white dark:bg-slate-900
      border-l border-slate-200 dark:border-white/10
      w-80 flex-shrink-0
    ">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.07] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Sparkle icon */}
          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">Related Messages</h2>
            <p className="text-[10px] text-violet-500 dark:text-violet-400 font-medium">AI-powered · Phase 11.3</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Close related messages panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Source message preview ───────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.07] flex-shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
          Finding messages similar to
        </p>
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
            {getInitial(sourceName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 truncate">{sourceName}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug line-clamp-2 mt-0.5">
              {sourcePreview}
            </p>
          </div>
        </div>
      </div>

      {/* ── Results area ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">

        {/* Loading skeleton */}
        {loading && (
          <div className="px-4 py-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse flex gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && results.length === 0 && (
          <EmptyState hasEmbedding={hasEmbedding} />
        )}

        {/* Results */}
        {!loading && !error && results.length > 0 && (
          <div className="py-2">
            <p className="px-4 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {results.length} similar message{results.length !== 1 ? 's' : ''} found
            </p>

            {results.map((result, idx) => {
              const displayName = result.user.fullName || result.user.username;
              const initial = getInitial(displayName);
              const isLastInChannel =
                idx === results.length - 1 ||
                results[idx + 1]?.channelId !== result.channelId;

              return (
                <div key={result.id}>
                  <button
                    onClick={() => {
                      onSelectResult(result.channelId, result.id);
                      onClose();
                    }}
                    className="w-full text-left px-4 py-3 flex items-start gap-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors duration-100 group/result"
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 group-hover/result:ring-2 group-hover/result:ring-violet-400/50 transition-all">
                      {result.user.avatar ? (
                        <img src={result.user.avatar} alt={displayName} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        initial
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header row: name + channel + time */}
                      <div className="flex items-baseline gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {displayName}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                          · #{result.channelName}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0 ml-auto">
                          {formatTime(result.createdAt)}
                        </span>
                      </div>

                      {/* Message preview */}
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2 mb-1.5">
                        {result.content || '[attachment]'}
                      </p>

                      {/* Similarity badge + jump arrow */}
                      <div className="flex items-center justify-between">
                        <SimilarityBadge score={result.similarity} />
                        <span className="text-[10px] text-violet-500 dark:text-violet-400 opacity-0 group-hover/result:opacity-100 transition-opacity flex items-center gap-0.5 font-medium">
                          Jump
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Divider between different channels */}
                  {!isLastInChannel && results[idx + 1]?.channelId !== result.channelId && (
                    <div className="mx-4 border-t border-slate-100 dark:border-white/[0.06]" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.07] flex-shrink-0">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
          Powered by{' '}
          <span className="text-violet-500 dark:text-violet-400 font-medium">pgvector</span>
          {' '}·{' '}
          <span className="text-violet-500 dark:text-violet-400 font-medium">Gemini text-embedding-004</span>
        </p>
      </div>
    </aside>
  );
}
