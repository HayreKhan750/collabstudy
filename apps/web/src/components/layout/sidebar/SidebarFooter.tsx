'use client';

import { WorkspaceRole } from '@/lib/api';
import { SidebarTooltip } from './SidebarTooltip';

interface SidebarFooterProps {
  username: string | undefined;
  userRole: WorkspaceRole;
  collapsed: boolean;
}

export function SidebarFooter({ username, userRole, collapsed }: SidebarFooterProps) {
  const initial = username ? username.charAt(0).toUpperCase() : 'U';

  if (collapsed) {
    return (
      <div className="border-t border-white/10 py-3 flex flex-col items-center">
        <SidebarTooltip label={username || 'User'}>
          <div className="relative mx-auto">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
              {initial}
            </div>
            <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-900" />
          </div>
        </SidebarTooltip>
      </div>
    );
  }

  return (
    <div className="border-t border-white/10 px-3 py-3">
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
            {initial}
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-900" aria-label="Online" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{username || 'User'}</p>
          <p className="text-[11px] text-gray-500 capitalize">{userRole.toLowerCase()}</p>
        </div>
      </div>
    </div>
  );
}
