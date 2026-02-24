'use client';

interface TypingIndicatorProps {
  typingUsers: Map<string, string>;
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  const names = Array.from(typingUsers.values()).slice(0, 3);
  if (names.length === 0) return null;

  let label: string;
  if (names.length === 1) {
    label = `${names[0]} is typing`;
  } else if (names.length === 2) {
    label = `${names[0]} and ${names[1]} are typing`;
  } else {
    label = `${names[0]}, ${names[1]} and ${names[2]} are typing`;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-400 select-none">
      {/* Bouncing dots */}
      <span className="flex items-center gap-0.5 h-4">
        <span
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: '0ms', animationDuration: '0.8s' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: '160ms', animationDuration: '0.8s' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: '320ms', animationDuration: '0.8s' }}
        />
      </span>
      <span className="italic">{label}…</span>
    </div>
  );
}
