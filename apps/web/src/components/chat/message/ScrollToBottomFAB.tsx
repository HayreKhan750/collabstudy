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
 *
 * Uses CSS opacity + scale transition (stays in DOM) for smooth
 * fade-in / fade-out animation — no layout shift or flicker.
 */
export function ScrollToBottomFAB({
  show,
  unreadCount,
  onScrollToUnread,
  onScrollToBottom,
}: ScrollToBottomFABProps) {
  const handleClick = () => {
    if (unreadCount > 0 && onScrollToUnread) {
      onScrollToUnread();
    } else {
      onScrollToBottom();
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label={unreadCount > 0 ? `${unreadCount} unread messages — scroll to first unread` : 'Scroll to bottom'}
      className={[
        'absolute bottom-4 right-4 z-30 flex flex-col items-center gap-0.5 group',
        'transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        show
          ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
          : 'opacity-0 translate-y-2 scale-90 pointer-events-none',
      ].join(' ')}
    >
      {/* Unread badge — fades in separately */}
      <span
        className={[
          'bg-indigo-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg min-w-[22px] text-center leading-tight',
          'transition-all duration-150',
          unreadCount > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none h-0 py-0',
        ].join(' ')}
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>

      {/* Arrow button — glassmorphism style */}
      <span className={[
        'w-10 h-10 rounded-full flex items-center justify-center',
        'bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm',
        'border border-slate-200/80 dark:border-white/10',
        'shadow-lg shadow-black/10 dark:shadow-black/30',
        'ring-1 ring-white/20',
        'hover:bg-white dark:hover:bg-slate-700/90',
        'hover:shadow-xl hover:shadow-black/15',
        'hover:-translate-y-0.5',
        'transition-all duration-150',
        'group-active:scale-95',
      ].join(' ')}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-slate-600 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-white transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </button>
  );
}
