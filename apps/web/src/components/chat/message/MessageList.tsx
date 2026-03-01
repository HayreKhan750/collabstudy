'use client';

/**
 * MessageList — virtualized, memoized chat message list.
 *
 * Uses @tanstack/react-virtual (dynamic height mode) so only the ~20-30
 * messages visible in the viewport are mounted in the DOM, giving smooth
 * 60 fps scrolling on channels with thousands of messages.
 *
 * Key decisions:
 * - `overscan: 5` keeps a small buffer above/below the viewport so fast
 *   scrolling never shows blank space.
 * - `estimateSize` returns 72px (a typical collapsed message height).
 *   The virtualizer measures actual heights after mount and corrects itself.
 * - The scroll element is passed in via `scrollRef` so ChatArea keeps full
 *   control of scroll-to-bottom / jump-to-message logic.
 * - The component is wrapped in React.memo — it only re-renders when the
 *   `messages` array reference or any stable callback changes.
 */

import { memo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  const parentRef = scrollRef as React.RefObject<HTMLDivElement>;

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
    // Use the message id as stable key so the virtualizer keeps item
    // positions stable when new messages are prepended (load older).
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  const items = virtualizer.getVirtualItems();

  // When a new message arrives at the bottom, the total height grows but the
  // scroll position stays fixed — measure immediately so layout is correct.
  useEffect(() => {
    virtualizer.measure();
  }, [messages.length, virtualizer]);

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
    /* Outer div has the total virtualizer height so the scrollbar reflects
       the real content length even though most nodes are unmounted. */
    <div
      style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
    >
      {items.map((virtualItem) => {
        const i = virtualItem.index;
        const message = messages[i];
        if (!message) return null;

        const isMine = message.user.id === currentUserId;
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
          <div
            key={message.id}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {isFirstUnread && <UnreadDivider ref={unreadDividerRef} />}
            <MessageBubble
              message={message}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              isOwnMessage={isMine}
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
    </div>
  );
}

export const MessageList = memo(MessageListInner);
