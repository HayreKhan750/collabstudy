'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, DigestResponse } from '@/lib/api';

interface NotificationPanelProps {
  token: string;
  /** Called when user clicks a channel notification — jumps to that channel */
  onSelectChannel?: (channelId: string) => void;
  /** Called when user clicks a DM notification — jumps to that conversation */
  onSelectConversation?: (conversationId: string) => void;
}

function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
      {hasUnread && (
        <circle cx="18" cy="6" r="4" fill="#ef4444" stroke="none" />
      )}
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
    </svg>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className={`h-3 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse ${width}`}
    />
  );
}

export default function NotificationPanel({
  token,
  onSelectChannel,
  onSelectConversation,
}: NotificationPanelProps) {
  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDigest = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDigest(token);
      setDigest(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load digest');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch digest when panel opens (lazy — don't fetch until user opens it)
  useEffect(() => {
    if (open && !digest && !loading) {
      fetchDigest();
    }
  }, [open, digest, loading, fetchDigest]);

  const handleRefresh = async () => {
    if (!token || refreshing) return;
    setRefreshing(true);
    try {
      await api.invalidateDigest(token);
      setDigest(null);
      await fetchDigest();
    } finally {
      setRefreshing(false);
    }
  };

  const hasUnread = !!(digest && !digest.allCaughtUp && digest.totalUnread > 0);

  // Ref to the bell button — used to position the portal panel below it
  const bellRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={() => setOpen((v) => !v)}
        title="Notification digest"
        className={`relative p-1.5 rounded-lg transition-colors ${
          open
            ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
        }`}
      >
        <BellIcon hasUnread={hasUnread} />
      </button>

      {/* Panel — rendered via Portal into document.body so it escapes all
          parent stacking contexts (backdrop-blur, transform, etc.)
          NOTE: AnimatePresence must live INSIDE the portal, not outside it,
          otherwise framer-motion cannot track child mount/unmount correctly. */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop (mobile) */}
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[199] md:hidden"
                onClick={() => setOpen(false)}
              />

              <motion.div
                key="panel"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed right-4 top-14 w-96 max-w-[calc(100vw-1rem)] max-h-[80vh] flex flex-col z-[200]
                         bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl
                         border border-slate-200 dark:border-white/[0.08]
                         rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-gray-800 flex-shrink-0 sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-2">
                  <span className="text-slate-900 dark:text-white font-semibold text-sm">
                    Notifications
                  </span>
                  {hasUnread && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
                      {digest!.totalUnread}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Refresh button */}
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing || loading}
                    title="Refresh digest"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  {/* Close button */}
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Body — scrollable */}
              <div className="flex-1 overflow-y-auto">
                {loading && (
                  <div className="p-4 space-y-3">
                    {/* AI digest skeleton */}
                    <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 border border-indigo-100 dark:border-indigo-500/20 p-4 space-y-2.5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-5 h-5 rounded bg-indigo-200 dark:bg-indigo-500/30 animate-pulse" />
                        <SkeletonLine width="w-28" />
                      </div>
                      <SkeletonLine width="w-full" />
                      <SkeletonLine width="w-5/6" />
                      <SkeletonLine width="w-4/6" />
                    </div>
                    {/* Row skeletons */}
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 px-1 py-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <SkeletonLine width="w-32" />
                          <SkeletonLine width="w-20" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {error && !loading && (
                  <div className="p-6 text-center">
                    <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>
                    <button
                      onClick={fetchDigest}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {digest && !loading && !error && (
                  <div className="p-4 space-y-3">
                    {/* ── AI Digest Card ─────────────────────────────────── */}
                    <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 border border-indigo-100 dark:border-indigo-500/20 p-4">
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-indigo-500 dark:text-indigo-400">
                          <SparkleIcon />
                        </span>
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                          AI Summary
                        </span>
                        <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                          {new Date(digest.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {digest.allCaughtUp ? (
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">✅</span>
                          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                            You're all caught up! No unread messages.
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {digest.aiSummary ?? 'Generating your personalised digest…'}
                        </p>
                      )}
                    </div>

                    {/* ── Unread Channels ────────────────────────────────── */}
                    {digest.unreadChannels.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1 mb-1.5">
                          Unread Channels
                        </p>
                        <div className="space-y-1">
                          {digest.unreadChannels.map((ch) => (
                            <button
                              key={ch.channelId}
                              onClick={() => {
                                onSelectChannel?.(ch.channelId);
                                setOpen(false);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all duration-150 text-left group shadow-sm dark:shadow-black/40 hover:shadow-md dark:hover:shadow-black/60"
                            >
                              {/* Icon */}
                              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">#</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                  #{ch.channelName}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {ch.messageCount} new
                                  {ch.mentionCount > 0 && (
                                    <span className="ml-1.5 text-red-500 dark:text-red-400 font-medium">
                                      · {ch.mentionCount} mention{ch.mentionCount !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </p>
                              </div>
                              {ch.mentionCount > 0 && (
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                                  {ch.mentionCount}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Unread DMs ─────────────────────────────────────── */}
                    {digest.unreadDms.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1 mb-1.5">
                          Direct Messages
                        </p>
                        <div className="space-y-1">
                          {digest.unreadDms.map((dm) => (
                            <button
                              key={dm.conversationId}
                              onClick={() => {
                                onSelectConversation?.(dm.conversationId);
                                setOpen(false);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all duration-150 text-left shadow-sm dark:shadow-black/40 hover:shadow-md dark:hover:shadow-black/60"
                            >
                              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-purple-600 dark:text-purple-400 font-bold text-sm">
                                  {dm.withUser.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                  @{dm.withUser}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {dm.messageCount} unread message{dm.messageCount !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center">
                                {dm.messageCount}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── All caught up (no items) ────────────────────────── */}
                    {digest.allCaughtUp && (
                      <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-2">
                        Check back later for new activity.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              {digest && !loading && (
                <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-800 flex-shrink-0">
                  <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center">
                    Digest powered by Gemini AI · refreshes every 5 min
                  </p>
                </div>
              )}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
