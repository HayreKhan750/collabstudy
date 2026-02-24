'use client';

interface ScrollToBottomFABProps {
  show: boolean;
  unreadCount: number;
  onClick: () => void;
}

export function ScrollToBottomFAB({ show, unreadCount, onClick }: ScrollToBottomFABProps) {
  if (!show) return null;

  return (
    <button
      onClick={onClick}
      className="
        absolute bottom-4 right-4 z-30
        w-10 h-10 rounded-full
        bg-gray-700 hover:bg-gray-600
        border border-white/15 shadow-lg
        flex items-center justify-center
        text-gray-300 hover:text-white
        transition-all duration-200
        active:scale-95
      "
      aria-label="Scroll to bottom"
    >
      {/* Down chevron */}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="
          absolute -top-1.5 -right-1.5
          min-w-[1.1rem] h-[1.1rem] px-1
          bg-red-500 text-white
          text-[10px] font-bold leading-none
          rounded-full flex items-center justify-center
          border-2 border-gray-700
        ">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
