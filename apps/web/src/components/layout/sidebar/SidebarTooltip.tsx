'use client';

/**
 * SidebarTooltip — animated fade-in tooltip for collapsed sidebar icon-only mode.
 * Uses CSS opacity + translate transition for a premium feel without framer-motion overhead.
 */
export function SidebarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip flex items-center w-full">
      {children}
      {/* Tooltip — fades in on hover with a smooth translate */}
      <div
        className="
          pointer-events-none absolute left-full ml-3 z-[200]
          flex items-center
          opacity-0 translate-x-[-4px]
          group-hover/tip:opacity-100 group-hover/tip:translate-x-0
          transition-all duration-150 ease-out
        "
      >
        <div className="
          relative
          bg-surface-4 dark:bg-surface-4
          text-fg text-xs font-medium
          px-2.5 py-1.5 rounded-lg
          shadow-elevation-3
          border border-border
          whitespace-nowrap
          backdrop-blur-md
        ">
          {label}
          {/* Arrow */}
          <div className="
            absolute right-full top-1/2 -translate-y-1/2
            border-4 border-transparent
            border-r-surface-4
          " />
        </div>
      </div>
    </div>
  );
}
