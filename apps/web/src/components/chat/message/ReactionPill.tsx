'use client';

import { Reaction } from '@/lib/api';

interface ReactionGroup {
  emoji: string;
  count: number;
  reactionIds: string[];
  userIds: string[];
  myReactionId?: string;
}

interface ReactionPillProps {
  reactions: Reaction[];
  currentUserId: string;
  onAdd: (emoji: string) => void;
  onRemove: (reactionId: string, emoji: string) => void;
}

export function groupReactions(reactions: Reaction[], currentUserId: string): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    if (!map.has(r.emoji)) {
      map.set(r.emoji, { emoji: r.emoji, count: 0, reactionIds: [], userIds: [] });
    }
    const g = map.get(r.emoji)!;
    g.count++;
    g.reactionIds.push(r.id);
    g.userIds.push(r.userId);
    if (r.userId === currentUserId) g.myReactionId = r.id;
  }
  return Array.from(map.values());
}

export function ReactionPill({ reactions, currentUserId, onAdd, onRemove }: ReactionPillProps) {
  const groups = groupReactions(reactions, currentUserId);
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {groups.map((g) => {
        const isMine = !!g.myReactionId;
        return (
          <button
            key={g.emoji}
            onClick={() => {
              if (isMine && g.myReactionId) {
                onRemove(g.myReactionId, g.emoji);
              } else {
                onAdd(g.emoji);
              }
            }}
            className={`
              inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
              border transition-all duration-150 select-none
              ${isMine
                ? 'bg-blue-500/25 border-blue-400/60 text-blue-200 hover:bg-blue-500/35'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20'}
            `}
            title={isMine ? `You reacted ${g.emoji}` : `React with ${g.emoji}`}
          >
            <span className="leading-none">{g.emoji}</span>
            <span className="leading-none tabular-nums">{g.count}</span>
          </button>
        );
      })}
    </div>
  );
}
