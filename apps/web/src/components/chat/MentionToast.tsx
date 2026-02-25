'use client';

import { useEffect } from 'react';

export interface MentionNotification {
  id: string; // client-generated unique key for dedup/dismiss
  messageId: string;
  content: string;
  channelId: string;
  channelName: string;
  workspaceName: string;
  author: { id: string; username: string; fullName?: string | null };
}

interface MentionToastProps {
  notifications: MentionNotification[];
  onDismiss: (id: string) => void;
}

/** Truncate message content to a readable preview. */
function preview(content: string, maxLen = 60): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen).trimEnd() + '…';
}

export default function MentionToast({ notifications, onDismiss }: MentionToastProps) {
  // Auto-dismiss each toast after 6 s
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[notifications.length - 1];
    const timer = setTimeout(() => onDismiss(latest.id), 6_000);
    return () => clearTimeout(timer);
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Mention notifications"
    >
      {notifications.map((n) => {
        const displayName = n.author.fullName || n.author.username;
        const initial = displayName.charAt(0).toUpperCase();

        return (
          <div
            key={n.id}
            className="pointer-events-auto flex items-start gap-3 w-80 bg-white dark:bg-slate-800 border border-blue-500/40 dark:border-blue-500/60 rounded-xl shadow-2xl px-4 py-3 animate-in slide-in-from-right-4 fade-in duration-300"
          >
            {/* Author avatar */}
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-0.5">
              {initial}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-slate-900 dark:text-white text-sm font-semibold leading-tight">
                <span className="text-blue-500 dark:text-blue-400">@{n.author.username}</span>
                {' mentioned you'}
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                in{' '}
                <span className="text-slate-700 dark:text-slate-200 font-medium">
                  #{n.channelName}
                </span>
                {' · '}
                <span className="text-slate-400 dark:text-slate-500">{n.workspaceName}</span>
              </p>
              <p className="text-slate-600 dark:text-slate-300 text-xs mt-1 italic truncate">
                "{preview(n.content)}"
              </p>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => onDismiss(n.id)}
              className="flex-shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mt-0.5"
              aria-label="Dismiss notification"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
