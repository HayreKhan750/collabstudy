'use client';

import { useEffect, useCallback } from 'react';
import NotificationPanel from '@/components/chat/NotificationPanel';

interface TopBarProps {
  workspaceName: string | null;
  channelName: string | null;
  isDM: boolean;
  dmRecipientName: string | null;
  onMobileMenuOpen: () => void;
  onLogout: () => void;
  username: string | undefined;
  onSearchOpen?: () => void;
  hasWorkspace?: boolean;
  token?: string | null;
  onSelectChannel?: (channelId: string) => void;
  onSelectConversation?: (conversationId: string) => void;
}

function HashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 text-slate-400 dark:text-slate-500 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 text-slate-400 dark:text-slate-500 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
      />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}

export function TopBar({
  workspaceName,
  channelName,
  isDM,
  dmRecipientName,
  onMobileMenuOpen,
  onLogout,
  username,
  onSearchOpen,
  hasWorkspace,
  token,
  onSelectChannel,
  onSelectConversation,
}: TopBarProps) {
  // Global Cmd+K / Ctrl+K shortcut
  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (hasWorkspace && onSearchOpen) onSearchOpen();
    }
  }, [hasWorkspace, onSearchOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [handleGlobalKey]);

  return (
    <header className="h-14 flex-shrink-0 bg-white/70 dark:bg-[#1a1744]/60 backdrop-blur-md border-b border-gray-200 dark:border-white/[0.08] flex items-center justify-between px-4 gap-4 z-10 sticky top-0">
      {/* Left — hamburger (mobile) + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenuOpen}
          className="md:hidden p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <HamburgerIcon />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm min-w-0" aria-label="Breadcrumb">
          {workspaceName && (
            <>
              <span className="text-slate-500 dark:text-slate-400 font-medium truncate max-w-[120px]">
                {workspaceName}
              </span>
              {(channelName || isDM) && (
                <svg
                  className="h-3.5 w-3.5 text-slate-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </>
          )}
          {isDM && dmRecipientName ? (
            <span className="flex items-center gap-1.5 text-slate-900 dark:text-white font-semibold min-w-0">
              <AtIcon />
              <span className="truncate">{dmRecipientName}</span>
            </span>
          ) : channelName ? (
            <span className="flex items-center gap-1.5 text-slate-900 dark:text-white font-semibold min-w-0">
              <HashIcon />
              <span className="truncate">{channelName}</span>
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 text-sm">
              {workspaceName ? 'Select a channel' : 'Welcome to CollabStudy'}
            </span>
          )}
        </nav>
      </div>

      {/* Centre — Search trigger (hidden when no workspace) */}
      {hasWorkspace && onSearchOpen && (
        <button
          onClick={onSearchOpen}
          className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700/60 border border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-all duration-150 text-sm flex-1 max-w-xs mx-auto"
          aria-label="Search messages (Ctrl+K)"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <span className="flex-1 text-left">Search messages…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex-shrink-0">
            <span className="text-[11px]">⌘</span>K
          </kbd>
        </button>
      )}

      {/* Right — notifications + user + logout */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Mobile search icon */}
        {hasWorkspace && onSearchOpen && (
          <button
            onClick={onSearchOpen}
            className="md:hidden p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Search"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>
        )}

        {/* Notification Bell / AI Digest Panel */}
        {token && (
          <NotificationPanel
            token={token}
            onSelectChannel={onSelectChannel}
            onSelectConversation={onSelectConversation}
          />
        )}

        <span className="hidden sm:block text-sm text-slate-500 dark:text-slate-400 font-medium">
          {username}
        </span>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-white hover:bg-red-50 dark:hover:bg-red-500/20 border border-transparent hover:border-red-200 dark:hover:border-red-500/30 transition-all"
          title="Logout"
        >
          <LogoutIcon />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
