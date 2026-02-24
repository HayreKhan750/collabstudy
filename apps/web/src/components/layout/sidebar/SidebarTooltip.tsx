'use client';

/** Shows a tooltip to the right of an element — used in collapsed mode. */
export function SidebarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip flex items-center w-full">
      {children}
      <div className="pointer-events-none absolute left-full ml-3 z-[200] hidden group-hover/tip:flex items-center">
        <div className="bg-gray-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl border border-white/10 whitespace-nowrap">
          {label}
        </div>
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
      </div>
    </div>
  );
}
