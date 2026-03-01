'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { DirectConversation } from '@/lib/api';
import { SidebarTooltip } from './SidebarTooltip';

interface DirectMessageListProps {
  directConversations: DirectConversation[];
  selectedConversationId: string | null | undefined;
  onConversationSelect: (conv: DirectConversation) => void;
  onNewDM: () => void;
  onHideDM?: (conv: DirectConversation) => void;
  onlineUserIds: Set<string>;
  userId: string | undefined;
  collapsed: boolean;
  /** Whether "Saved Messages" is currently selected */
  savedMessagesSelected?: boolean;
  /** Callback when user clicks "Saved Messages" */
  onSavedMessagesSelect?: () => void;
}

function BookmarkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6.75 3A2.25 2.25 0 0 0 4.5 5.25v15.75l7.5-4.5 7.5 4.5V5.25A2.25 2.25 0 0 0 17.25 3H6.75Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none flex-shrink-0"
    >
      {count > 99 ? '99+' : count}
    </motion.span>
  );
}

export function DirectMessageList({
  directConversations,
  selectedConversationId,
  onConversationSelect,
  onNewDM,
  onHideDM,
  onlineUserIds,
  userId,
  collapsed,
  savedMessagesSelected,
  onSavedMessagesSelect,
}: DirectMessageListProps) {
  // ── Collapsed mode ───────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2 border-t border-slate-200 dark:border-white/10">
        {/* Saved Messages icon */}
        <SidebarTooltip label="Saved Messages">
          <button
            onClick={onSavedMessagesSelect}
            className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-150 mx-auto
              ${savedMessagesSelected
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-gradient-to-br from-indigo-500/20 to-purple-600/20 text-indigo-500 dark:text-indigo-400 hover:from-indigo-500/40 hover:to-purple-600/40'}`}
          >
            <BookmarkIcon />
          </button>
        </SidebarTooltip>

        {directConversations.slice(0, 5).map((conv) => {
          const other = conv.participants.find((p) => p.userId !== userId)?.user;
          if (!other) return null;
          const displayName = other.fullName || other.username;
          const isOnline = onlineUserIds.has(other.id);
          const isSelected = selectedConversationId === conv.id;
          return (
            <SidebarTooltip key={conv.id} label={displayName}>
              <button
                onClick={() => onConversationSelect(conv)}
                className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-150 mx-auto
                  ${isSelected ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-indigo-500/60 hover:text-white'}`}
              >
                {displayName.charAt(0).toUpperCase()}
                {/* Online dot */}
                <span
                  className={`absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${isOnline ? 'bg-green-400' : 'bg-slate-400'}`}
                />
                {/* Unread dot */}
                <AnimatePresence>
                  {conv.unreadCount && conv.unreadCount > 0 ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                    >
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </button>
            </SidebarTooltip>
          );
        })}
        <SidebarTooltip label="New direct message">
          <button
            onClick={onNewDM}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-purple-500/20 text-slate-500 dark:text-slate-400 hover:text-purple-500 dark:hover:text-purple-400 flex items-center justify-center transition-all duration-150 mx-auto"
          >
            <PlusIcon />
          </button>
        </SidebarTooltip>
      </div>
    );
  }

  // ── Expanded mode ────────────────────────────────────────────────────────
  return (
    <div className="border-t border-slate-200 dark:border-white/10 pt-3 pb-2">
      <div className="flex items-center justify-between px-3 mb-1">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Direct Messages
        </span>
        <button
          onClick={onNewDM}
          className="p-0.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          title="New direct message"
        >
          <PlusIcon />
        </button>
      </div>

      {/* ── Saved Messages pinned item ────────────────────────────────── */}
      <div className="px-1.5 mb-1">
        <button
          onClick={onSavedMessagesSelect}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-100
            ${savedMessagesSelected
              ? 'bg-indigo-500/20 dark:bg-indigo-500/30 text-indigo-600 dark:text-indigo-300'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}`}
        >
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
            ${savedMessagesSelected
              ? 'bg-indigo-500 text-white'
              : 'bg-gradient-to-br from-indigo-500/80 to-purple-600/80 text-white'}`}>
            <BookmarkIcon />
          </div>
          <span className="text-xs font-semibold truncate flex-1 text-left">Saved Messages</span>
        </button>
      </div>

      {directConversations.length === 0 ? (
        <div className="px-3 py-4 flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
            <svg
              className="h-5 w-5 text-slate-400 dark:text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.112v4.604c0 1.108-.806 2.057-1.907 2.185-.173.02-.347.038-.52.054-.85.065-1.615.304-2.273.686-.325.19-.673-.083-.673-.46V14.25a.75.75 0 01.75-.75h3a.75.75 0 00.75-.75v-3a.75.75 0 00-.75-.75H6.75A.75.75 0 006 9.75v3c0 .414.336.75.75.75h3a.75.75 0 01.75.75v2.44c0 .377-.348.651-.673.46a6.735 6.735 0 00-2.273-.685 49.141 49.141 0 01-.52-.055C5.556 16.18 4.75 15.23 4.75 14.123V9.518c0-.984.616-1.828 1.5-2.112"
              />
            </svg>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">No direct messages yet</p>
          <button
            onClick={onNewDM}
            className="text-xs text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors"
          >
            + Start a conversation
          </button>
        </div>
      ) : (
        <div className="space-y-0.5 px-1.5">
          {directConversations.map((conv) => {
            const other = conv.participants.find((p) => p.userId !== userId)?.user;
            if (!other) return null;
            const displayName = other.fullName || other.username;
            const lastMsg = conv.messages?.[0] ?? null;
            const isSelected = selectedConversationId === conv.id;
            const isOnline = onlineUserIds.has(other.id);

            return (
              <div key={conv.id} className="relative group/dm flex items-center">
                {/* Active glow indicator bar */}
                {isSelected && (
                  <motion.span
                    layoutId="dm-active-bar"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <button
                  onClick={() => onConversationSelect(conv)}
                  className={`flex-1 min-w-0 text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-150
                    ${isSelected ? 'bg-violet-500/15 dark:bg-violet-500/20 text-violet-700 dark:text-violet-200 font-medium' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {/* Avatar with online dot */}
                  <div className="relative flex-shrink-0">
                    {other?.avatar ? (
                      <img
                        src={other.avatar}
                        alt={displayName}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-purple-500/80 flex items-center justify-center text-white text-xs font-semibold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${isOnline ? 'bg-green-400' : 'bg-slate-400'}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs truncate ${conv.unreadCount && conv.unreadCount > 0 ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium'}`}
                    >
                      {displayName}
                    </p>
                    {lastMsg?.content && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {lastMsg.content}
                      </p>
                    )}
                  </div>

                  <AnimatePresence>
                    {conv.unreadCount && conv.unreadCount > 0 ? (
                      <UnreadBadge count={conv.unreadCount} />
                    ) : null}
                  </AnimatePresence>
                </button>

                {/* Close/hide button — appears on hover */}
                {onHideDM && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onHideDM(conv);
                    }}
                    className="absolute right-1 opacity-0 group-hover/dm:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all"
                    title="Close conversation"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
