'use client';

import { forwardRef } from 'react';

export const UnreadDivider = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="flex items-center my-4 px-2 select-none" role="separator" aria-label="Unread messages">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-500/40 to-red-500/40" />
      <span className="mx-3 px-3 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold tracking-wide whitespace-nowrap">
        New Messages
      </span>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-red-500/40 to-red-500/40" />
    </div>
  );
});

UnreadDivider.displayName = 'UnreadDivider';
