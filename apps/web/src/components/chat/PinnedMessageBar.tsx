'use client';

interface PinnedMessageBarProps {
  content: string;
  pinnedBy?: string;
  onClick?: () => void;
  onClose?: () => void;
}

export function PinnedMessageBar({ content, pinnedBy, onClick, onClose }: PinnedMessageBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-white/10 cursor-pointer group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      {/* Telegram-style vertical accent line */}
      <div className="w-0.5 h-8 bg-blue-500 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0" onClick={onClick}>
        <p className="text-xs font-semibold text-blue-500 dark:text-blue-400 mb-0.5">📌 Pinned Message</p>
        <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{content}</p>
      </div>
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Dismiss pinned message"
        >
          ✕
        </button>
      )}
    </div>
  );
}
