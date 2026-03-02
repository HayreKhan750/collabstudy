'use client';

/**
 * MessageList — memoized chat message list.
 *
 * Renders messages in a simple flex-column so each message naturally pushes
 * the next one down. This avoids all the position:absolute + translateY
 * overlap issues that virtualizers introduce when dynamic-height content
 * (images, polls, thread previews) loads asynchronously after initial render.
 *
 * Performance note: at 50-100 messages per page this is perfectly smooth.
 * If we ever need virtualisation for 1000+ message history we can re-add it,
 * but it must use a scroll-anchor strategy (not estimateSize) to handle images.
 */

import { memo, useEffect, useRef } from 'react';
import { MessageBubble, MessageData } from './MessageBubble';
import { UnreadDivider } from './UnreadDivider';

export interface MessageListProps {
  messages: MessageData[];
  currentUserId: string;
  lastReadAt: string | null;
  highlightedMessageId: string | null;
  editingMessageId: string | null;
  editContent: string;
  editError: string | null;
  editSaving: boolean;
  isSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  readReceipts: Record<string, string>;
  unreadDividerRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** All callbacks are stable (wrapped in useCallback in parent) */
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string, reactionId: string, emoji: string) => void;
  onOpenThread: (messageId: string) => void;
  onStartEdit: (messageId: string) => void;
  onDeleteRequest: (messageId: string) => void;
  onEditChange: (value: string) => void;
  onEditSave: (messageId: string) => void;
  onEditCancel: () => void;
  onFindSimilar: (message: MessageData) => void;
  onCopy: (content: string) => void;
  onForward: (message: MessageData) => void;
  onPin: (messageId: string) => void;
  onVotePoll: (messageId: string, optionId: string) => void;
  onClosePoll: (messageId: string) => void;
  onSelect: (messageId: string) => void;
  onSave: (message: MessageData) => void;
  onAvatarClick: (user: MessageData['user']) => void;
}

function MessageListInner({
  messages,
  currentUserId,
  lastReadAt,
  highlightedMessageId,
  editingMessageId,
  editContent,
  editError,
  editSaving,
  isSelectionMode,
  selectedMessageIds,
  readReceipts,
  unreadDividerRef,
  scrollRef,
  onAddReaction,
  onRemoveReaction,
  onOpenThread,
  onStartEdit,
  onDeleteRequest,
  onEditChange,
  onEditSave,
  onEditCancel,
  onFindSimilar,
  onCopy,
  onForward,
  onPin,
  onVotePoll,
  onClosePoll,
  onSelect,
  onSave,
  onAvatarClick,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // When a new message is added, scroll the container to the bottom so the
  // sender always sees their message without any manual scroll.
  const prevLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          No messages yet. Start the conversation!
        </p>
      </div>
    );
  }

  return (
    // Simple flex column — every message is in normal document flow.
    // No position:absolute, no translateY, no virtualiser math.
    <div className="flex flex-col">
      {messages.map((message, i) => {
        const prevMsg = messages[i - 1];
        const nextMsg = messages[i + 1];

        const isFirstInGroup =
          !prevMsg ||
          prevMsg.user.id !== message.user.id ||
          new Date(message.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() >=
            5 * 60 * 1000;

        const isLastInGroup =
          !nextMsg ||
          nextMsg.user.id !== message.user.id ||
          new Date(nextMsg.createdAt).getTime() - new Date(message.createdAt).getTime() >=
            5 * 60 * 1000;

        const isFirstUnread =
          !!lastReadAt &&
          new Date(message.createdAt) > new Date(lastReadAt) &&
          (!prevMsg || new Date(prevMsg.createdAt) <= new Date(lastReadAt));

        return (
          <div key={message.id}>
            {isFirstUnread && <UnreadDivider ref={unreadDividerRef} />}
            <MessageBubble
              message={message}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              isOwnMessage={message.user.id === currentUserId}
              isHighlighted={highlightedMessageId === message.id}
              currentUserId={currentUserId}
              readReceipts={readReceipts}
              onAddReaction={onAddReaction}
              onRemoveReaction={onRemoveReaction}
              onOpenThread={() => onOpenThread(message.id)}
              onStartEdit={() => onStartEdit(message.id)}
              onDeleteRequest={() => onDeleteRequest(message.id)}
              isEditing={editingMessageId === message.id}
              editContent={editContent}
              editError={editError}
              editSaving={editSaving}
              onEditChange={onEditChange}
              onEditSave={() => onEditSave(message.id)}
              onEditCancel={onEditCancel}
              onFindSimilar={message.content ? () => onFindSimilar(message) : undefined}
              onCopy={message.content ? () => onCopy(message.content!) : undefined}
              onForward={message.content ? () => onForward(message) : undefined}
              onPin={() => onPin(message.id)}
              onVotePoll={(msgId, optId) => onVotePoll(msgId, optId)}
              onClosePoll={(msgId) => onClosePoll(msgId)}
              onSelect={() => onSelect(message.id)}
              onSave={() => onSave(message)}
              onAvatarClick={() => onAvatarClick(message.user)}
              isSelected={selectedMessageIds.has(message.id)}
              isSelectionMode={isSelectionMode}
            />
          </div>
        );
      })}
      {/* Invisible anchor — scrolled into view when new messages arrive */}
      <div ref={bottomRef} />
    </div>
  );
}

export const MessageList = memo(MessageListInner);
