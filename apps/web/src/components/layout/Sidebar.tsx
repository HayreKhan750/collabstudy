'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Workspace, Channel, WorkspaceRole, DirectConversation, api } from '@/lib/api';
import CreateChannelModal from '@/components/chat/CreateChannelModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { PromptModal } from '@/components/ui/PromptModal';
import { WorkspaceSwitcher } from './sidebar/WorkspaceSwitcher';
import { ChannelList } from './sidebar/ChannelList';
import { DirectMessageList } from './sidebar/DirectMessageList';
import { SidebarFooter } from './sidebar/SidebarFooter';
import { SidebarTooltip } from './sidebar/SidebarTooltip';

interface SidebarProps {
  workspaces: Workspace[];
  channels: Channel[];
  selectedWorkspace: Workspace | null;
  selectedChannel: Channel | null;
  onWorkspaceSelect: (workspace: Workspace) => void;
  onChannelSelect: (channel: Channel) => void;
  onChannelCreated: (channel: Channel) => void;
  onCreateWorkspace: () => void;
  onDiscoverWorkspaces: () => void;
  onWorkspaceRenamed: (workspace: Workspace) => void;
  onWorkspaceDeleted: (workspaceId: string) => void;
  onChannelRenamed: (channel: Channel) => void;
  onChannelDeleted: (channelId: string) => void;
  onChannelLeft?: (channelId: string) => void;
  onWorkspaceLeft?: (workspaceId: string) => void;
  token: string | null;
  userRole?: WorkspaceRole;
  username?: string;
  userId?: string;
  userAvatar?: string | null;
  directConversations?: DirectConversation[];
  selectedConversationId?: string | null;
  onConversationSelect?: (conv: DirectConversation) => void;
  onNewDM?: () => void;
  onHideDM?: (conv: DirectConversation) => void;
  onlineUserIds?: Set<string>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onOpenSettings?: () => void;
}

function ChevronLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function Sidebar({
  workspaces,
  channels,
  selectedWorkspace,
  selectedChannel,
  onWorkspaceSelect,
  onChannelSelect,
  onChannelCreated,
  onCreateWorkspace,
  onDiscoverWorkspaces,
  onWorkspaceRenamed,
  onWorkspaceDeleted,
  onChannelRenamed,
  onChannelDeleted,
  onChannelLeft,
  onWorkspaceLeft,
  token,
  userRole = 'MEMBER' as WorkspaceRole,
  username,
  userId,
  userAvatar,
  directConversations = [],
  selectedConversationId,
  onConversationSelect,
  onNewDM,
  onHideDM,
  onlineUserIds = new Set(),
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
  onOpenSettings,
}: SidebarProps) {
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // ── Prompt / Confirm modal state ─────────────────────────────────────────
  const [promptModal, setPromptModal] = useState<{
    title: string;
    message: string;
    defaultValue: string;
    onConfirm: (val: string) => void;
  } | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    danger: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Reset loading state when channels prop updates
  useEffect(() => {
    setLoadingChannels(false);
  }, [channels]);
  useEffect(() => {
    if (selectedWorkspace) setLoadingChannels(true);
  }, [selectedWorkspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChannelCreated = (channel: Channel) => {
    setShowCreateChannel(false);
    onChannelCreated(channel);
  };

  // ── Workspace actions ─────────────────────────────────────────────────────
  const handleRenameWorkspace = () => {
    if (!selectedWorkspace || !token) return;
    setPromptModal({
      title: 'Rename Workspace',
      message: 'Enter a new name for this workspace.',
      defaultValue: selectedWorkspace.name,
      onConfirm: async (newName) => {
        setPromptModal(null);
        if (!newName.trim() || newName.trim() === selectedWorkspace.name) return;
        try {
          const updated = await api.renameWorkspace(token, selectedWorkspace.id, newName.trim());
          onWorkspaceRenamed(updated);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Failed to rename workspace');
        }
      },
    });
  };

  const handleDeleteWorkspace = () => {
    if (!selectedWorkspace || !token) return;
    setConfirmModal({
      title: 'Delete Workspace',
      message: `Are you sure you want to delete "${selectedWorkspace.name}"? This will permanently delete all channels and messages. This cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.deleteWorkspace(token, selectedWorkspace.id);
          onWorkspaceDeleted(selectedWorkspace.id);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Failed to delete workspace');
        }
      },
    });
  };

  const handleLeaveWorkspace = () => {
    if (!selectedWorkspace || !token) return;
    setConfirmModal({
      title: 'Leave Workspace',
      message: `Are you sure you want to leave "${selectedWorkspace.name}"? You can rejoin if it is public.`,
      danger: false,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.leaveWorkspace(token, selectedWorkspace.id);
          onWorkspaceLeft?.(selectedWorkspace.id);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Failed to leave workspace');
        }
      },
    });
  };

  // ── Channel actions ───────────────────────────────────────────────────────
  const handleRenameChannel = (channel: Channel) => {
    if (!token) return;
    setPromptModal({
      title: 'Rename Channel',
      message: `Enter a new name for #${channel.name}.`,
      defaultValue: channel.name,
      onConfirm: async (newName) => {
        setPromptModal(null);
        if (!newName.trim() || newName.trim() === channel.name) return;
        try {
          const updated = await api.renameChannel(token, channel.id, newName.trim());
          onChannelRenamed(updated);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Failed to rename channel');
        }
      },
    });
  };

  const handleDeleteChannel = (channel: Channel) => {
    if (!token) return;
    setConfirmModal({
      title: 'Delete Channel',
      message: `Are you sure you want to delete #${channel.name}? All messages will be permanently lost.`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.deleteChannel(token, channel.id);
          onChannelDeleted(channel.id);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Failed to delete channel');
        }
      },
    });
  };

  const handleLeaveChannel = (channel: Channel) => {
    if (!token) return;
    setConfirmModal({
      title: 'Leave Channel',
      message: `Are you sure you want to leave #${channel.name}?`,
      danger: false,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.leaveChannel(token, channel.id);
          onChannelLeft?.(channel.id);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Failed to leave channel');
        }
      },
    });
  };

  const isOwner = userRole === 'OWNER';
  const canManage = userRole === 'OWNER' || userRole === 'ADMIN';

  // ── Sidebar inner content (shared by both desktop + mobile) ──────────────
  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo + collapse toggle */}
      <div
        className={`flex items-center h-14 border-b border-slate-200 dark:border-white/10 flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-3'}`}
      >
        {!collapsed && (
          <span className="text-slate-900 dark:text-white font-bold text-base tracking-tight">
            CollabStudy
          </span>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {/* ── Unread section: quick access to all unread channels & DMs ── */}
        {!collapsed && (() => {
          const unreadChannels = channels.filter(c => (c.unreadCount ?? 0) > 0);
          const unreadDMs = directConversations.filter(c => (c.unreadCount ?? 0) > 0);
          if (unreadChannels.length === 0 && unreadDMs.length === 0) return null;
          return (
            <div className="pt-3 pb-1 border-b border-slate-200 dark:border-white/10">
              <div className="px-3 mb-1">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Unread</span>
              </div>
              <div className="space-y-0.5 px-1.5">
                {unreadChannels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => onChannelSelect(ch)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all font-semibold"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                    <span className="flex-1 truncate text-slate-900 dark:text-white">{ch.name}</span>
                    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none flex-shrink-0">
                      {(ch.unreadCount ?? 0) > 99 ? '99+' : ch.unreadCount}
                    </span>
                  </button>
                ))}
                {unreadDMs.map(conv => {
                  const other = conv.participants.find((p: any) => p.userId !== userId)?.user;
                  const displayName = other?.fullName || other?.username || 'DM';
                  const isOnline = onlineUserIds.has(other?.id ?? '');
                  return (
                    <button
                      key={conv.id}
                      onClick={() => onConversationSelect?.(conv)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all font-semibold"
                    >
                      <div className="relative flex-shrink-0">
                        {other?.avatar ? (
                          <img src={other.avatar} alt={displayName} className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-purple-500/80 flex items-center justify-center text-white text-[10px] font-semibold">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white dark:border-slate-900 ${isOnline ? 'bg-green-400' : 'bg-slate-400'}`} />
                      </div>
                      <span className="flex-1 truncate text-slate-900 dark:text-white">{displayName}</span>
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none flex-shrink-0">
                        {(conv.unreadCount ?? 0) > 99 ? '99+' : conv.unreadCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Workspace switcher */}
        <WorkspaceSwitcher
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          onWorkspaceSelect={onWorkspaceSelect}
          onCreateWorkspace={onCreateWorkspace}
          onDiscoverWorkspaces={onDiscoverWorkspaces}
          onRenameWorkspace={handleRenameWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onLeaveWorkspace={!isOwner ? handleLeaveWorkspace : undefined}
          collapsed={collapsed}
          isOwner={isOwner}
        />

        {/* Channel list */}
        <ChannelList
          channels={channels}
          selectedChannel={selectedChannel}
          onChannelSelect={onChannelSelect}
          onCreateChannel={() => setShowCreateChannel(true)}
          onRenameChannel={handleRenameChannel}
          onDeleteChannel={handleDeleteChannel}
          onLeaveChannel={!isOwner ? handleLeaveChannel : undefined}
          userRole={userRole}
          hasWorkspace={!!selectedWorkspace}
          loading={loadingChannels}
          collapsed={collapsed}
        />

        {/* Direct Messages */}
        <DirectMessageList
          directConversations={directConversations}
          selectedConversationId={selectedConversationId}
          onConversationSelect={onConversationSelect ?? (() => {})}
          onNewDM={onNewDM ?? (() => {})}
          onHideDM={onHideDM}
          onlineUserIds={onlineUserIds}
          userId={userId}
          collapsed={collapsed}
        />
      </div>

      {/* Footer */}
      <SidebarFooter username={username} userRole={userRole} collapsed={collapsed} avatar={userAvatar} onOpenSettings={onOpenSettings} />
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-white/10 transition-all duration-300 ease-in-out flex-shrink-0 z-20
          ${collapsed ? 'w-[60px]' : 'w-60'}`}
        style={{ minWidth: collapsed ? 60 : 240 }}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile slide-over drawer ─────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={onMobileClose}
            />
            {/* Drawer */}
            <motion.aside
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 w-72 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-white/10 z-50 md:hidden flex flex-col"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {showCreateChannel && selectedWorkspace && token && (
        <CreateChannelModal
          workspaceId={selectedWorkspace.id}
          token={token}
          onClose={() => setShowCreateChannel(false)}
          onCreated={handleChannelCreated}
        />
      )}

      <PromptModal
        open={!!promptModal}
        title={promptModal?.title ?? ''}
        label={promptModal?.message ?? ''}
        defaultValue={promptModal?.defaultValue ?? ''}
        onConfirm={(val) => promptModal?.onConfirm(val)}
        onCancel={() => setPromptModal(null)}
      />

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        danger={confirmModal?.danger ?? false}
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </>
  );
}
