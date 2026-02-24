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
  token: string | null;
  userRole?: WorkspaceRole;
  username?: string;
  userId?: string;
  directConversations?: DirectConversation[];
  selectedConversationId?: string | null;
  onConversationSelect?: (conv: DirectConversation) => void;
  onNewDM?: () => void;
  onlineUserIds?: Set<string>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function ChevronLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
  token,
  userRole = 'MEMBER' as WorkspaceRole,
  username,
  userId,
  directConversations = [],
  selectedConversationId,
  onConversationSelect,
  onNewDM,
  onlineUserIds = new Set(),
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // ── Prompt / Confirm modal state ─────────────────────────────────────────
  const [promptModal, setPromptModal] = useState<{
    title: string; message: string; defaultValue: string;
    onConfirm: (val: string) => void;
  } | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    title: string; message: string; danger: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Reset loading state when channels prop updates
  useEffect(() => { setLoadingChannels(false); }, [channels]);
  useEffect(() => { if (selectedWorkspace) setLoadingChannels(true); }, [selectedWorkspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const isOwner = userRole === 'OWNER';
  const canManage = userRole === 'OWNER' || userRole === 'ADMIN';

  // ── Sidebar inner content (shared by both desktop + mobile) ──────────────
  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo + collapse toggle */}
      <div className={`flex items-center h-14 border-b border-white/10 flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-3'}`}>
        {!collapsed && (
          <span className="text-white font-bold text-base tracking-tight">CollabStudy</span>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {/* Workspace switcher */}
        <WorkspaceSwitcher
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          onWorkspaceSelect={onWorkspaceSelect}
          onCreateWorkspace={onCreateWorkspace}
          onDiscoverWorkspaces={onDiscoverWorkspaces}
          onRenameWorkspace={handleRenameWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
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
          onlineUserIds={onlineUserIds}
          userId={userId}
          collapsed={collapsed}
        />
      </div>

      {/* Footer */}
      <SidebarFooter username={username} userRole={userRole} collapsed={collapsed} />
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col h-full bg-gray-900 border-r border-white/10 transition-all duration-300 ease-in-out flex-shrink-0 z-20
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
              className="fixed inset-y-0 left-0 w-72 bg-gray-900 border-r border-white/10 z-50 md:hidden flex flex-col"
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
