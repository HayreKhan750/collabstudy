'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api, Workspace, Channel, CreateWorkspaceData, WorkspaceRole, WorkspaceMember, Message, MentionUser, DirectConversation } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import ChatArea from '@/components/chat/ChatArea';
import ThreadPanel from '@/components/chat/ThreadPanel';
import DirectMessageArea from '@/components/chat/DirectMessageArea';
import DiscoverWorkspacesModal from '@/components/chat/DiscoverWorkspacesModal';
import MentionToast, { MentionNotification } from '@/components/chat/MentionToast';
import { NoWorkspaceState, NoChannelState } from '@/components/chat/EmptyState';
import { io, Socket } from 'socket.io-client';
import CallModal, { IncomingCallPayload } from '@/components/chat/CallModal';
import { SearchModal } from '@/components/chat/SearchModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function DashboardPage() {
  const { user, token, logout, loading } = useAuth();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Sidebar collapse / mobile drawer state ────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /** The parent message whose thread is open in the right panel, or null. */
  const [activeThread, setActiveThread] = useState<Message | null>(null);

  /** Latest reply message pushed from ChatArea's socket to ThreadPanel. */
  const [pendingThreadReply, setPendingThreadReply] = useState<Message | null>(null);

  /** Flat list of workspace members for @mention autocomplete. */
  const [workspaceMembers, setWorkspaceMembers] = useState<MentionUser[]>([]);

  /** Active mention toast notifications. */
  const [mentionToasts, setMentionToasts] = useState<MentionNotification[]>([]);

  // ── Direct Messaging state ─────────────────────────────────────────────────
  const [directConversations, setDirectConversations] = useState<DirectConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<DirectConversation | null>(null);
  const [showNewDMModal, setShowNewDMModal] = useState(false);
  const [dmUsers, setDmUsers] = useState<{ user: { id: string; username: string; fullName: string | null; avatar: string | null; status: string } }[]>([]);

  // ── Page-level workspace socket ────────────────────────────────────────────
  const workspaceSocketRef = useRef<Socket | null>(null);
  const processedMessageIds = useRef(new Set<string>());

  // ── Presence state ────────────────────────────────────────────────────────
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchJumpTarget, setSearchJumpTarget] = useState<{ channelId: string; messageId: string } | null>(null);

  // ── Restore last active channel from localStorage ─────────────────────
  useEffect(() => {
    if (channels.length > 0) {
      const saved = localStorage.getItem('lastActiveChannel');
      if (saved) {
        const stillExists = channels.find(c => c.id === saved);
        if (stillExists && !selectedChannel) {
          setSelectedChannel(stillExists);
          localStorage.removeItem('lastActiveChannel');
        }
      }
    }
  }, [channels]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save active channel to localStorage whenever it changes ────────────
  useEffect(() => {
    if (selectedChannel) {
      localStorage.setItem('lastActiveChannel', selectedChannel.id);
    }
  }, [selectedChannel]);

  // ── Voice/Video call state ────────────────────────────────────────────────
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{ targetUserId: string; targetName: string; roomId: string } | null>(null);

  // ── Ringtone audio ────────────────────────────────────────────────────────
  const ringAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isRinging, setIsRinging] = useState(false);

  useEffect(() => {
    if (incomingCall || outgoingCall) setIsRinging(true);
  }, [incomingCall, outgoingCall]);

  useEffect(() => {
    if (isRinging) {
      if (!ringAudioRef.current) {
        const audio = new Audio('/ringtone.mp3');
        audio.loop = true;
        audio.volume = 0.6;
        audio.play().catch((err) => console.warn('[Ringtone] Could not auto-play:', err));
        ringAudioRef.current = audio;
      }
    } else {
      if (ringAudioRef.current) {
        ringAudioRef.current.pause();
        ringAudioRef.current.currentTime = 0;
        ringAudioRef.current = null;
      }
    }
    return () => {
      if (ringAudioRef.current) {
        ringAudioRef.current.pause();
        ringAudioRef.current.currentTime = 0;
        ringAudioRef.current = null;
      }
    };
  }, [isRinging]);

  const stopRingtone = useCallback(() => setIsRinging(false), []);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (user && token) {
      loadWorkspaces();
      loadDirectConversations();
    }
  }, [user, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDirectConversations = async () => {
    if (!token) return;
    try {
      const convs = await api.getDirectConversations(token);
      setDirectConversations(convs);
    } catch (e) {
      console.warn('[DM] failed to load conversations', e);
    }
  };

  // ── Workspace-level socket ────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !user) return;
    if (workspaceSocketRef.current?.connected) return;

    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    workspaceSocketRef.current = socket;

    socket.on('new_channel_created', (channel: Channel) => {
      setChannels((prev) => {
        if (prev.some((c) => c.id === channel.id)) return prev;
        return [...prev, channel];
      });
    });

    socket.on('user_joined_workspace', (payload: { workspaceId: string; userId: string; username: string }) => {
      setWorkspaces((prev) =>
        prev.map((w) => w.id !== payload.workspaceId ? w : { ...w, _count: { members: (w._count?.members ?? 0) + 1 } }),
      );
    });

    socket.on('user_mentioned', (payload: Omit<MentionNotification, 'id'>) => {
      const notification: MentionNotification = { ...payload, id: `${payload.messageId}-${Date.now()}` };
      setMentionToasts((prev) => [...prev, notification]);
    });

    socket.on('channel_updated', (updated: Channel) => {
      setChannels(prev => prev.map(c => c.id === updated.id ? { ...updated, unreadCount: c.unreadCount } : c));
    });

    socket.on('channel_read_cleared', ({ channelId }: { channelId: string }) => {
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, unreadCount: 0 } : c));
    });

    socket.on('dm_read_cleared', ({ conversationId }: { conversationId: string }) => {
      setDirectConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c));
    });

    socket.on('dm_unread_notification', (payload: { conversationId: string; senderId: string; messageId: string }) => {
      if (payload.messageId && processedMessageIds.current.has(payload.messageId)) return;
      if (payload.messageId) processedMessageIds.current.add(payload.messageId);
      setSelectedConversation(cur => {
        if (cur?.id !== payload.conversationId) {
          setDirectConversations(prev =>
            // Only increment unread count if the message was sent by someone else
            payload.senderId !== user?.id
              ? prev.map(c => c.id === payload.conversationId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c)
              : prev,
          );
        }
        return cur;
      });
    });

    socket.on('presence_sync', (userIds: string[]) => { setOnlineUserIds(new Set(userIds)); });
    socket.on('presence_update', (payload: { userId: string; status: 'ONLINE' | 'OFFLINE' }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        payload.status === 'ONLINE' ? next.add(payload.userId) : next.delete(payload.userId);
        return next;
      });
    });

    socket.on('call_offer', (payload: IncomingCallPayload) => { setIncomingCall(payload); });

    socket.on('channel_unread_notification', (payload: { channelId: string; senderId: string; messageId: string }) => {
      if (payload.messageId && processedMessageIds.current.has(payload.messageId)) return;
      if (payload.messageId) processedMessageIds.current.add(payload.messageId);
      setSelectedChannel(cur => {
        if (cur?.id !== payload.channelId) {
          // Only increment unread if the message is from someone else
          if (payload.senderId !== user?.id) {
            setChannels(prev => prev.map(c => c.id === payload.channelId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c));
          }
        }
        return cur;
      });
    });

    socket.on('channel_deleted', ({ channelId }: { channelId: string }) => {
      setChannels(prev => {
        const remaining = prev.filter(c => c.id !== channelId);
        setSelectedChannel(cur => cur?.id === channelId ? (remaining[0] ?? null) : cur);
        return remaining;
      });
    });

    socket.on('workspace_updated', (updated: Workspace) => {
      setWorkspaces(prev => prev.map(w => w.id === updated.id ? { ...w, name: updated.name } : w));
      setSelectedWorkspace(cur => cur?.id === updated.id ? { ...cur, name: updated.name } : cur);
    });

    socket.on('workspace_deleted', ({ workspaceId }: { workspaceId: string }) => {
      setWorkspaces(prev => {
        const remaining = prev.filter(w => w.id !== workspaceId);
        setSelectedWorkspace(cur => {
          if (cur?.id === workspaceId) { setChannels([]); setSelectedChannel(null); return remaining[0] ?? null; }
          return cur;
        });
        return remaining;
      });
    });

    return () => {
      socket.off('new_channel_created');
      socket.off('user_joined_workspace');
      socket.off('user_mentioned');
      socket.off('channel_updated');
      socket.off('channel_deleted');
      socket.off('workspace_updated');
      socket.off('workspace_deleted');
      socket.off('channel_read_cleared');
      socket.off('dm_read_cleared');
      socket.off('dm_unread_notification');
      socket.off('channel_unread_notification');
      socket.off('presence_sync');
      socket.off('presence_update');
      socket.off('call_offer');
      socket.disconnect();
      workspaceSocketRef.current = null;
    };
  }, [token, user]);

  const loadWorkspaces = async () => {
    if (!token) return;
    try {
      setLoadingWorkspaces(true);
      const data = await api.getWorkspaces(token);
      setWorkspaces(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const loadChannels = useCallback(async (workspace: Workspace) => {
    if (!token) return;
    try {
      const data = await api.getChannels(workspace.id, token);
      setChannels(prev => data.map(ch => {
        const existing = prev.find(p => p.id === ch.id);
        return { ...ch, unreadCount: ch.unreadCount ?? existing?.unreadCount ?? 0 };
      }));
      if (data.length > 0) setSelectedChannel(data[0]);
      else setSelectedChannel(null);
    } catch (err) {
      console.error('Failed to load channels:', err);
      setChannels([]);
    }
  }, [token]);

  useEffect(() => {
    if (selectedWorkspace && token) {
      api.getWorkspaceUsersForDM(token, selectedWorkspace.id).then(setDmUsers).catch(() => {});
    }
  }, [selectedWorkspace?.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedWorkspace) {
      loadChannels(selectedWorkspace);
      setWorkspaceMembers(
        (selectedWorkspace.members ?? [])
          .map((m) => ({ id: m.userId, username: m.user?.username ?? '', fullName: m.user?.fullName ?? null, avatar: m.user?.avatar ?? null }))
          .filter((m) => m.username),
      );
    } else {
      setChannels([]);
      setSelectedChannel(null);
      setWorkspaceMembers([]);
    }
  }, [selectedWorkspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const userRole: WorkspaceRole = (() => {
    if (!selectedWorkspace || !user) return 'MEMBER';
    const member = selectedWorkspace.members?.find((m: WorkspaceMember) => m.userId === user.id);
    return member?.role ?? 'MEMBER';
  })();

  const handleWorkspaceJoined = (workspace: Workspace) => {
    setWorkspaces((prev) => prev.find((w) => w.id === workspace.id) ? prev : [workspace, ...prev]);
    setSelectedWorkspace(workspace);
    setSelectedChannel(null);
    workspaceSocketRef.current?.emit('join_workspace', { workspaceId: workspace.id });
  };

  const handleChannelCreated = (channel: Channel) => {
    setChannels((prev) => [...prev, channel]);
    setSelectedChannel(channel);
  };

  const handleWorkspaceSelect = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setActiveThread(null);
    setMobileSidebarOpen(false); // close mobile drawer on selection
  };

  const handleWorkspaceRenamed = (updated: Workspace) => {
    setWorkspaces(prev => prev.map(w => w.id === updated.id ? { ...w, name: updated.name } : w));
    setSelectedWorkspace(cur => cur?.id === updated.id ? { ...cur, name: updated.name } : cur);
  };

  const handleWorkspaceDeleted = (workspaceId: string) => {
    setWorkspaces(prev => {
      const remaining = prev.filter(w => w.id !== workspaceId);
      setSelectedWorkspace(cur => {
        if (cur?.id === workspaceId) { setChannels([]); setSelectedChannel(null); return remaining[0] ?? null; }
        return cur;
      });
      return remaining;
    });
  };

  const handleWorkspaceLeft = (workspaceId: string) => {
    setWorkspaces(prev => {
      const remaining = prev.filter(w => w.id !== workspaceId);
      setSelectedWorkspace(cur => {
        if (cur?.id === workspaceId) { setChannels([]); setSelectedChannel(null); return remaining[0] ?? null; }
        return cur;
      });
      return remaining;
    });
  };

  const handleChannelLeft = (channelId: string) => {
    setChannels(prev => {
      const remaining = prev.filter(c => c.id !== channelId);
      setSelectedChannel(cur => cur?.id === channelId ? (remaining[0] ?? null) : cur);
      return remaining;
    });
  };

  const handleHideDM = async (conv: DirectConversation) => {
    if (!token) return;
    try {
      await api.hideDmConversation(token, conv.id);
    } catch (e) {
      console.warn('[DM] hide error', e);
    }
    setDirectConversations(prev => prev.filter(c => c.id !== conv.id));
    setSelectedConversation(cur => cur?.id === conv.id ? null : cur);
  };

  const handleChannelRenamed = (updated: Channel) => {
    setChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelectedChannel(cur => cur?.id === updated.id ? updated : cur);
  };

  const handleChannelDeleted = (channelId: string) => {
    setChannels(prev => {
      const remaining = prev.filter(c => c.id !== channelId);
      setSelectedChannel(cur => cur?.id === channelId ? (remaining[0] ?? null) : cur);
      return remaining;
    });
  };

  const handleCreateWorkspace = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    const formData = new FormData(e.currentTarget);
    const data: CreateWorkspaceData = { name: formData.get('name') as string };
    try {
      setCreateLoading(true);
      setError(null);
      const newWorkspace = await api.createWorkspace(token, data);
      setShowCreateModal(false);
      await loadWorkspaces();
      setSelectedWorkspace(newWorkspace);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setCreateLoading(false);
    }
  };

  // Derive DM recipient name for TopBar
  const dmRecipient = selectedConversation
    ? selectedConversation.participants.find((p) => p.userId !== user?.id)?.user
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (loadingWorkspaces) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
          <span>Loading workspaces…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <Sidebar
        workspaces={workspaces}
        channels={channels}
        selectedWorkspace={selectedWorkspace}
        selectedChannel={selectedChannel}
        onWorkspaceSelect={handleWorkspaceSelect}
        onChannelSelect={(ch) => {
          setSelectedChannel(ch);
          setSelectedConversation(null);
          setMobileSidebarOpen(false);
          if (ch.unreadCount && ch.unreadCount > 0 && token) {
            setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, unreadCount: 0 } : c));
            api.markChannelRead(token, ch.id).catch(() => {});
          }
        }}
        onChannelCreated={handleChannelCreated}
        onCreateWorkspace={() => setShowCreateModal(true)}
        onDiscoverWorkspaces={() => setShowDiscoverModal(true)}
        onWorkspaceRenamed={handleWorkspaceRenamed}
        onWorkspaceDeleted={handleWorkspaceDeleted}
        onWorkspaceLeft={handleWorkspaceLeft}
        onChannelRenamed={handleChannelRenamed}
        onChannelDeleted={handleChannelDeleted}
        onChannelLeft={handleChannelLeft}
        token={token}
        userRole={userRole}
        username={user?.username}
        userId={user?.id}
        userAvatar={user?.avatar}
        directConversations={directConversations}
        selectedConversationId={selectedConversation?.id}
        onConversationSelect={(conv) => {
          setSelectedConversation(conv);
          setSelectedChannel(null);
          setMobileSidebarOpen(false);
          if (conv.unreadCount && conv.unreadCount > 0 && token) {
            setDirectConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
            api.markDmRead(token, conv.id).catch(() => {});
          }
        }}
        onNewDM={() => setShowNewDMModal(true)}
        onHideDM={handleHideDM}
        onlineUserIds={onlineUserIds}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden relative">
        {/* Top bar */}
        <TopBar
          workspaceName={selectedWorkspace?.name ?? null}
          channelName={selectedChannel?.name ?? null}
          isDM={!!selectedConversation}
          dmRecipientName={dmRecipient ? (dmRecipient.fullName || dmRecipient.username) : null}
          onMobileMenuOpen={() => setMobileSidebarOpen(true)}
          onLogout={logout}
          username={user?.username}
          hasWorkspace={!!selectedWorkspace}
          onSearchOpen={() => setSearchOpen(true)}
          token={token}
          onSelectChannel={(channelId) => {
            const target = channels.find((c) => c.id === channelId);
            if (target) {
              setSelectedChannel(target);
              setSelectedConversation(null);
            }
          }}
          onSelectConversation={(conversationId) => {
            const target = directConversations.find((c) => c.id === conversationId);
            if (target) {
              setSelectedConversation(target);
              setSelectedChannel(null);
            }
          }}
        />

        {/* Content */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {selectedConversation && token ? (
            (() => {
              const recipient = selectedConversation.participants.find(p => p.userId !== user?.id)?.user;
              return recipient ? (
                <DirectMessageArea
                  key={selectedConversation.id}
                  conversationId={selectedConversation.id}
                  recipient={recipient}
                  onlineUserIds={onlineUserIds}
                  onBack={() => {
                    setSelectedConversation(null);
                    setMobileSidebarOpen(true);
                  }}
                  onStartCall={(targetUserId, targetName) => {
                    const roomId = [user?.id, targetUserId].sort().join('_');
                    setOutgoingCall({ targetUserId, targetName, roomId });
                  }}
                />
              ) : null;
            })()
          ) : selectedChannel && token ? (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <ChatArea
                key={selectedChannel.id}
                channelId={selectedChannel.id}
                channelName={selectedChannel.name}
                workspaceId={selectedWorkspace?.id ?? ''}
                onOpenThread={(msg) => setActiveThread(msg)}
                workspaceMembers={workspaceMembers}
                onNewReply={(msg) => setPendingThreadReply(msg)}
                jumpToMessageId={searchJumpTarget?.channelId === selectedChannel.id ? searchJumpTarget.messageId : undefined}
                onJumpHandled={() => setSearchJumpTarget(null)}
                onBack={() => {
                  setSelectedChannel(null);
                  setMobileSidebarOpen(true);
                }}
              />
              {activeThread && (
                <ThreadPanel
                  parentMessage={activeThread}
                  channelId={selectedChannel.id}
                  onClose={() => setActiveThread(null)}
                  workspaceMembers={workspaceMembers}
                  newReply={pendingThreadReply}
                />
              )}
            </div>
          ) : selectedWorkspace ? (
            <div className="flex-1 min-h-0 flex flex-col bg-slate-100 dark:bg-slate-800">
              <NoChannelState workspaceName={selectedWorkspace.name} />
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col bg-slate-100 dark:bg-slate-800">
              <NoWorkspaceState onCreate={() => setShowCreateModal(true)} />
            </div>
          )}
        </div>
      </div>

      {/* ── Search Modal ──────────────────────────────────────────────────── */}
      {searchOpen && token && selectedWorkspace && (
        <SearchModal
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          workspaceId={selectedWorkspace.id}
          token={token}
          onSelectResult={(channelId, messageId) => {
            // Find the channel in current list and select it
            const target = channels.find(c => c.id === channelId);
            if (target) {
              setSelectedChannel(target);
              setSelectedConversation(null);
              setSearchJumpTarget({ channelId, messageId });
            }
            setSearchOpen(false);
          }}
        />
      )}

      {/* ── Mention toasts ────────────────────────────────────────────────── */}
      <MentionToast
        notifications={mentionToasts}
        onDismiss={(id) => setMentionToasts((prev) => prev.filter((n) => n.id !== id))}
      />

      {/* ── Call modal ────────────────────────────────────────────────────── */}
      <CallModal
        socket={workspaceSocketRef.current}
        userId={user?.id ?? ''}
        username={user?.username ?? ''}
        token={token ?? ''}
        incomingCall={incomingCall}
        onIncomingCallHandled={() => setIncomingCall(null)}
        outgoingCall={outgoingCall}
        onOutgoingCallHandled={() => setOutgoingCall(null)}
        onStopRingtone={stopRingtone}
      />

      {/* ── New DM Modal ──────────────────────────────────────────────────── */}
      {showNewDMModal && token && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-slate-900 dark:text-white font-semibold text-lg mb-4">New Direct Message</h3>
            {dmUsers.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm">No other members in this workspace.</p>
            ) : (
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {dmUsers.map(({ user: u }) => (
                  <li key={u.id}>
                    <button
                      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                      onClick={async () => {
                        setShowNewDMModal(false);
                        if (!token) return;
                        try {
                          const rawConv = await api.startDirectConversation(token, u.id);
                          // Normalize: ensure `messages` array always exists so DirectMessageList
                          // can safely access conv.messages?.[0] without crashing
                          const conv = { ...rawConv, messages: rawConv.messages ?? [] };
                          setDirectConversations(prev => prev.some(c => c.id === conv.id) ? prev : [conv, ...prev]);
                          setSelectedConversation(conv);
                          setSelectedChannel(null);
                        } catch (e) {
                          console.warn('[DM] start error', e);
                        }
                      }}
                    >
                      <div className="w-9 h-9 rounded-full bg-purple-500/80 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                        {(u.fullName || u.username).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-slate-900 dark:text-white text-sm font-medium">{u.fullName || u.username}</p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs">@{u.username}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowNewDMModal(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discover Workspaces Modal ──────────────────────────────────────── */}
      {showDiscoverModal && token && (
        <DiscoverWorkspacesModal
          token={token}
          onClose={() => setShowDiscoverModal(false)}
          onJoined={handleWorkspaceJoined}
        />
      )}

      {/* ── Create Workspace Modal ─────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create New Workspace</h3>
            {error && <p className="text-red-500 dark:text-red-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handleCreateWorkspace}>
              <label htmlFor="ws-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Workspace Name *
              </label>
              <input
                type="text"
                name="name"
                id="ws-name"
                required
                maxLength={100}
                className="block w-full rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                placeholder="My Study Group"
              />
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={createLoading}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {createLoading ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
