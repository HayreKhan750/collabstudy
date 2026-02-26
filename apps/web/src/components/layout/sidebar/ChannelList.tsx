'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Channel, WorkspaceRole } from '@/lib/api';
import { SidebarTooltip } from './SidebarTooltip';

interface ChannelListProps {
  channels: Channel[];
  selectedChannel: Channel | null;
  onChannelSelect: (channel: Channel) => void;
  onCreateChannel: () => void;
  onRenameChannel: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
  onLeaveChannel?: (channel: Channel) => void;
  userRole: WorkspaceRole;
  hasWorkspace: boolean;
  loading: boolean;
  collapsed: boolean;
}

function HashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
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

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3 w-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3 w-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

/** Animated pill unread badge */
function UnreadBadge({ count }: { count: number }) {
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none flex-shrink-0 tabular-nums"
    >
      {count > 99 ? '99+' : count}
    </motion.span>
  );
}

/** Empty state when no workspace or no channels */
function ChannelEmptyState({
  hasWorkspace,
  canCreate,
  onCreateChannel,
}: {
  hasWorkspace: boolean;
  canCreate: boolean;
  onCreateChannel: () => void;
}) {
  if (!hasWorkspace) {
    return (
      <div className="px-3 py-6 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
          <svg
            className="h-6 w-6 text-slate-400 dark:text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            />
          </svg>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Select a workspace to see channels
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-6 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
        <svg
          className="h-6 w-6 text-slate-400 dark:text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
          />
        </svg>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1">
          No channels yet
        </p>
        {canCreate && (
          <button
            onClick={onCreateChannel}
            className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
          >
            + Create one
          </button>
        )}
      </div>
    </div>
  );
}

export function ChannelList({
  channels,
  selectedChannel,
  onChannelSelect,
  onCreateChannel,
  onRenameChannel,
  onDeleteChannel,
  onLeaveChannel,
  userRole,
  hasWorkspace,
  loading,
  collapsed,
}: ChannelListProps) {
  const canManage = userRole === 'OWNER' || userRole === 'ADMIN';
  const canLeave = userRole !== 'OWNER';

  // ── Collapsed mode: icon-only channel list ───────────────────────────────
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        {channels.slice(0, 8).map((channel) => (
          <SidebarTooltip key={channel.id} label={`# ${channel.name}`}>
            <button
              onClick={() => onChannelSelect(channel)}
              className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 mx-auto
                ${
                  selectedChannel?.id === channel.id
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              <HashIcon />
              <AnimatePresence>
                {channel.unreadCount && channel.unreadCount > 0 ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                  >
                    {channel.unreadCount > 9 ? '9+' : channel.unreadCount}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          </SidebarTooltip>
        ))}
        {canManage && hasWorkspace && (
          <SidebarTooltip label="Create channel">
            <button
              onClick={onCreateChannel}
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-indigo-500/20 text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 flex items-center justify-center transition-all duration-150 mx-auto"
            >
              <PlusIcon />
            </button>
          </SidebarTooltip>
        )}
      </div>
    );
  }

  // ── Expanded mode ────────────────────────────────────────────────────────
  return (
    <div className="pt-3 pb-1">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 mb-1">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Channels
        </span>
        {canManage && hasWorkspace && (
          <button
            onClick={onCreateChannel}
            className="p-0.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            title="Create channel"
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {loading ? (
        <div className="px-3 py-4 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Loading…</span>
        </div>
      ) : channels.length === 0 ? (
        <ChannelEmptyState
          hasWorkspace={hasWorkspace}
          canCreate={canManage}
          onCreateChannel={onCreateChannel}
        />
      ) : (
        <div className="space-y-0.5 px-1.5">
          {channels.map((channel) => (
            <div key={channel.id} className="relative group/ch flex items-center">
              <button
                onClick={() => onChannelSelect(channel)}
                className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-100
                  ${
                    selectedChannel?.id === channel.id
                      ? 'bg-indigo-500/20 dark:bg-indigo-500/30 text-indigo-600 dark:text-indigo-200'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <HashIcon />
                <span
                  className={`flex-1 truncate ${channel.unreadCount && channel.unreadCount > 0 ? 'font-semibold text-slate-900 dark:text-white' : ''}`}
                >
                  {channel.name}
                </span>
                <AnimatePresence>
                  {channel.unreadCount && channel.unreadCount > 0 ? (
                    <UnreadBadge count={channel.unreadCount} />
                  ) : null}
                </AnimatePresence>
              </button>

              {/* Hover action buttons — rename / delete / leave */}
              {(canManage || (canLeave && onLeaveChannel)) && (
                <div className="absolute right-1 opacity-0 group-hover/ch:opacity-100 flex items-center gap-0.5 transition-opacity">
                  {canManage && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRenameChannel(channel);
                        }}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Rename"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChannel(channel);
                        }}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                  {canLeave && onLeaveChannel && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLeaveChannel(channel);
                      }}
                      className="p-1 rounded hover:bg-orange-50 dark:hover:bg-orange-500/20 text-slate-500 dark:text-slate-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                      title="Leave channel"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
