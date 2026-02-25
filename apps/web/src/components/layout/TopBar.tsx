'use client';

interface TopBarProps {
  workspaceName: string | null;
  channelName: string | null;
  isDM: boolean;
  dmRecipientName: string | null;
  onMobileMenuOpen: () => void;
  onLogout: () => void;
  username: string | undefined;
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
}: TopBarProps) {
  return (
    <header className="h-14 flex-shrink-0 bg-white/90 dark:bg-[#141821]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between px-4 gap-4 z-10 shadow-sm dark:shadow-none">
      {/* Left — hamburger (mobile) + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenuOpen}
          className="md:hidden p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/8 transition-all duration-200 flex-shrink-0"
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

      {/* Right — user + logout */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="hidden sm:block text-sm text-slate-500 dark:text-slate-400 font-medium">
          {username}
        </span>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border border-transparent hover:border-red-200 dark:hover:border-red-500/20 transition-all duration-200"
          title="Logout"
        >
          <LogoutIcon />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
