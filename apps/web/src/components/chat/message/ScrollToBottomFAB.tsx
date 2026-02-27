'use client';

interface ScrollToBottomFABProps {
  show: boolean;
  unreadCount: number;
  /** Called on first click — scroll to unread divider if available */
  onScrollToUnread?: () => void;
  /** Called on second click (or first if no unread) — scroll to very bottom */
  onScrollToBottom: () => void;
}

/**
 * Telegram-style floating scroll button.
 *
 * Behaviour:
 * - If there are unread messages (unreadCount > 0):
 *   • 1st click → scroll to oldest unread (unread divider)
 *   • 2nd click → scroll to very bottom
 * - If no unread messages:
 *   • Any click → scroll to very bottom
 */
export function ScrollToBottomFAB({
  show,
  unreadCount,
  onScrollToUnread,
  onScrollToBottom,
}: ScrollToBottomFABProps) {
  if (!show) return null;

  const handleClick = () => {
    if (unreadCount > 0 && onScrollToUnread) {
      // First click: jump to unread divider
      onScrollToUnread();
    } else {
      // No unread or second click: jump to bottom
      onScrollToBottom();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="absolute bottom-4 right-4 z-30 flex flex-col items-center gap-0.5 group"
      aria-label={unreadCount > 0 ? `${unreadCount} unread messages — scroll to first unread` : 'Scroll to bottom'}
    >
      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="bg-indigo-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg min-w-[22px] text-center leading-tight">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {/* Arrow button */}
      <span className="w-9 h-9 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full flex items-center justify-center shadow-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-slate-600 dark:text-slate-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </button>
  );
}
