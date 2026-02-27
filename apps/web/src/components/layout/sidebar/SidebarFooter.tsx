'use client';

import { useRouter } from 'next/navigation';
import { WorkspaceRole } from '@/lib/api';
import { SidebarTooltip } from './SidebarTooltip';

interface SidebarFooterProps {
  username: string | undefined;
  avatarUrl?: string | null;
  userRole: WorkspaceRole;
  collapsed: boolean;
}

export function SidebarFooter({ username, avatarUrl, userRole, collapsed }: SidebarFooterProps) {
  const router = useRouter();
  const initial = username ? username.charAt(0).toUpperCase() : 'U';

  /** Renders user avatar: real photo if available, gradient initial otherwise. */
  const Avatar = ({ size }: { size: 'sm' | 'md' }) => {
    const dim = size === 'sm' ? 'w-9 h-9' : 'w-8 h-8';
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={username || 'User'}
          className={`${dim} rounded-xl object-cover shadow-lg ring-1 ring-white/10`}
        />
      );
    }
    return (
      <div className={`${dim} rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-lg`}>
        {initial}
      </div>
    );
  };

  if (collapsed) {
    return (
      <div className="border-t border-slate-200 dark:border-white/10 py-3 flex flex-col items-center">
        <SidebarTooltip label={username || 'User'}>
          <div className="relative mx-auto">
            <Avatar size="sm" />
            <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white dark:border-slate-900" />
          </div>
        </SidebarTooltip>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 dark:border-white/10 px-3 py-3">
      <button
        onClick={() => router.push('/settings')}
        className="w-full flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group text-left"
        title="Settings"
      >
        <div className="relative flex-shrink-0">
          <Avatar size="md" />
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white dark:border-slate-900" aria-label="Online" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{username || 'User'}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{userRole.toLowerCase()}</p>
        </div>
        {/* Settings gear icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  );
}
