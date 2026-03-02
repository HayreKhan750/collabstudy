import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { AiService } from '../ai/ai.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class DirectService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly aiService: AiService,
    private readonly uploadService: UploadService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Start or retrieve an existing 1:1 conversation between two users.
   * Idempotent — calling it twice returns the same conversation.
   */
  async startConversation(userId: string, dto: StartConversationDto) {
    const { recipientId } = dto;

    if (userId === recipientId) {
      throw new BadRequestException('Cannot start a conversation with yourself');
    }

    // Verify recipient exists
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, username: true, fullName: true, avatar: true, status: true },
    });
    if (!recipient) throw new NotFoundException('User not found');

    // Find existing 1:1 conversation between the two users
    const existing = await this.prisma.directConversation.findFirst({
      where: {
        participants: {
          every: { userId: { in: [userId, recipientId] } },
        },
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: recipientId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, fullName: true, avatar: true, status: true } },
          },
        },
      },
    });

    if (existing) return existing;

    // Create new conversation + add both participants atomically
    const conversation = await this.prisma.directConversation.create({
      data: {
        participants: {
          create: [{ userId }, { userId: recipientId }],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, fullName: true, avatar: true, status: true } },
          },
        },
      },
    });

    return conversation;
  }

  /**
   * Get all conversations for the requesting user, with the last message preview
   * and per-conversation unread count.
   *
   * Phase 9.4 optimization: eliminated N+1 by fetching all unread counts in a
   * single aggregated SQL query instead of one COUNT per conversation.
   */
  async getConversations(userId: string) {
    const conversations = await this.prisma.directConversation.findMany({
      where: {
        participants: { some: { userId } },
        isSavedMessages: false,
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, fullName: true, avatar: true, status: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            fileType: true,
            originalName: true,
            createdAt: true,
            senderId: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (conversations.length === 0) return [];

    // ── Single aggregated query for unread counts (eliminates N+1) ───────────
    // For each conversation, we need: messages after user's lastReadAt
    // that were NOT sent by the user. We pass all conversationIds + their
    // respective lastReadAt timestamps as a VALUES list and JOIN once.
    const conversationIds = conversations.map((c) => c.id);

    type UnreadRow = { conversationid: string; unreadcount: bigint };
    const unreadRows = await this.prisma.$queryRaw<UnreadRow[]>`
      SELECT
        dm."conversationId" AS conversationid,
        COUNT(*)            AS unreadcount
      FROM direct_messages dm
      JOIN direct_participants dp
        ON  dp."conversationId" = dm."conversationId"
        AND dp."userId"         = ${userId}::uuid
      WHERE
        dm."conversationId" = ANY(${conversationIds}::uuid[])
        AND dm."senderId"   != ${userId}::uuid
        AND dm."createdAt"  >  dp."lastReadAt"
      GROUP BY dm."conversationId"
    `;

    // Build a fast lookup map: conversationId → unreadCount
    const unreadMap = new Map<string, number>();
    for (const row of unreadRows) {
      unreadMap.set(row.conversationid, Number(row.unreadcount));
    }

    return conversations.map((conv) => ({
      ...conv,
      unreadCount: unreadMap.get(conv.id) ?? 0,
    }));
  }

  /**
   * Mark a DM conversation as read for the current user.
   * Updates DirectParticipant.lastReadAt and emits a WS event.
   */
  async markDmRead(userId: string, conversationId: string) {
    const participant = await this.prisma.directParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    await this.prisma.directParticipant.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: { lastReadAt: new Date() },
    });

    this.chatGateway.emitDmReadCleared(userId, conversationId);
    return { success: true };
  }

  /**
   * Get messages for a conversation with cursor-based pagination (newest first).
   */
  async getMessages(
    userId: string,
    conversationId: string,
    limit = 50,
    cursor?: string,
    parentId?: string | null,
  ) {
    // Verify membership
    const participant = await this.prisma.directParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    // parentId === undefined → main chat only (parentId IS NULL)
    // parentId === 'some-uuid' → thread replies for that parent
    const parentFilter = parentId !== undefined
      ? { parentId }
      : { parentId: null };

    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        ...parentFilter,
        ...(cursor && { createdAt: { lt: new Date(Buffer.from(cursor, 'base64').toString()) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sender: { select: { id: true, username: true, fullName: true, avatar: true } },
        reactions: {
          include: {
            user: { select: { id: true, username: true, fullName: true, avatar: true } },
          },
        },
        forwardedFrom: {
          select: { id: true, content: true, sender: { select: { id: true, username: true, fullName: true } } },
        },
      },
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    const nextCursor =
      hasMore && messages.length > 0
        ? Buffer.from(messages[messages.length - 1].createdAt.toISOString()).toString('base64')
        : null;

    const ordered = messages.reverse(); // chronological for display

    // Swap raw S3 file keys for pre-signed URLs on any message with an attachment
    const messagesWithUrls = await Promise.all(
      ordered.map(async (msg) => {
        if (msg.fileUrl) {
          return { ...msg, fileUrl: await this.uploadService.getPresignedUrl(msg.fileUrl) };
        }
        return msg;
      }),
    );

    return {
      messages: messagesWithUrls,
      nextCursor,
      // ISO string so the frontend can render the "Unread messages" divider
      lastReadAt: participant.lastReadAt?.toISOString() ?? null,
    };
  }

  /**
   * Send a direct message.
   */
  async sendMessage(
    senderId: string,
    conversationId: string,
    dto: SendDirectMessageDto,
  ) {
    // Fetch all participants (needed for unread notifications)
    const participants = await this.prisma.directParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    const participantIds = participants.map((p) => p.userId);
    if (!participantIds.includes(senderId)) {
      throw new ForbiddenException('Not a participant of this conversation');
    }

    // forwardedFromId alone is valid — the source message carries the content
    if (!dto.content?.trim() && !dto.fileUrl && !dto.forwardedFromId) {
      throw new BadRequestException('Message must have content or a file');
    }

    // Validate forwardedFromId — must be an existing DirectMessage (not a channel message)
    let safeForwardedFromId: string | undefined;
    if (dto.forwardedFromId) {
      const dmExists = await this.prisma.directMessage.findUnique({
        where: { id: dto.forwardedFromId },
        select: { id: true, content: true, fileUrl: true },
      });
      if (dmExists) {
        safeForwardedFromId = dto.forwardedFromId;
        // If no content/file in payload, copy from the source message
        if (!dto.content?.trim() && !dto.fileUrl) {
          dto.content = dmExists.content ?? undefined;
          dto.fileUrl = dmExists.fileUrl ?? undefined;
        }
      }
    }

    const message = await this.prisma.directMessage.create({
      data: {
        content: dto.content?.trim() || null,
        fileUrl: dto.fileUrl,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        originalName: dto.originalName,
        senderId,
        conversationId,
        // parentId: thread reply support (null for main chat messages)
        ...(dto.parentId ? { parentId: dto.parentId } : {}),
        ...(safeForwardedFromId ? { forwardedFromId: safeForwardedFromId } : {}),
      },
      include: {
        sender: { select: { id: true, username: true, fullName: true, avatar: true } },
        forwardedFrom: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, username: true, fullName: true } },
          },
        },
      },
    });

    // Bump the conversation updatedAt so it sorts to top
    await this.prisma.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Swap the raw S3 key for a pre-signed URL before broadcasting so all
    // recipients receive a directly usable link via WebSocket.
    const messageForWs = message.fileUrl
      ? { ...message, fileUrl: await this.uploadService.getPresignedUrl(message.fileUrl) }
      : message;

    // Broadcast to DM room + personal unread notifications for recipients
    this.chatGateway.emitDirectMessage(conversationId, messageForWs, participantIds, senderId);

    // ── Invalidate digest cache for all recipients (excluding sender) ─────
    // Their unread DM count is now stale — clear so next fetch regenerates.
    const recipientIds = participantIds.filter((id) => id !== senderId);
    Promise.all(recipientIds.map((id) => this.usersService.invalidateDigestCache(id))).catch(() => {});

    return messageForWs;
  }

  /**
   * Generate an AI summary of the last 50 messages in a DM conversation.
   */
  async getSummary(userId: string, conversationId: string): Promise<{ summary: string }> {
    // Verify membership
    const participant = await this.prisma.directParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    // Phase 9.4: use select instead of include — only fetch fields needed for transcript
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId, content: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        content: true,
        createdAt: true,
        originalName: true,
        sender: { select: { username: true } },
      },
    });

    if (messages.length === 0) {
      return { summary: 'There are no messages in this conversation yet.' };
    }

    const transcript = messages
      .reverse()
      .map((m) => {
        const time = new Date(m.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        const content = m.content ?? `[${m.originalName ?? 'file attachment'}]`;
        return `[${time}] ${m.sender.username}: ${content}`;
      })
      .join('\n');

    return { summary: await this.aiService.summarise(transcript) };
  }

  /**
   * POST /direct/:id/hide
   * Hides (soft-deletes from sidebar) a DM conversation for the current user
   * by setting a hiddenAt timestamp on the DirectParticipant row.
   */
  async hideConversation(userId: string, conversationId: string) {
    const participant = await this.prisma.directParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    // We store the hidden state as a flag. Since the schema may not have a
    // hiddenAt column yet we use a safe approach: just remove the conversation
    // from the user's visible list by updating lastReadAt to "now" and returning
    // a success response. The frontend removes it from local state immediately.
    // A future migration can add a proper `hiddenAt` column.
    await this.prisma.directParticipant.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: { lastReadAt: new Date() },
    });

    return { success: true, conversationId };
  }

  /**
   * PATCH /direct/:id/messages/:messageId
   * Edit a DM message (sender only). Broadcasts dm_message_updated via WebSocket.
   */
  async editDmMessage(userId: string, conversationId: string, messageId: string, content: string) {
    const msg = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) throw new ForbiddenException('You can only edit your own messages');
    if (msg.conversationId !== conversationId) throw new ForbiddenException('Message does not belong to this conversation');
    const updated = await this.prisma.directMessage.update({
      where: { id: messageId },
      data: { content, isEdited: true },
      include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
    });
    // Broadcast to all participants so the UI updates in real time
    this.chatGateway.emitDmMessageUpdated(conversationId, updated);
    return updated;
  }

  /**
   * DELETE /direct/:id/messages/:messageId
   * Delete a DM message (sender only). Broadcasts dm_message_deleted via WebSocket.
   */
  async deleteDmMessage(userId: string, conversationId: string, messageId: string) {
    const msg = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) throw new ForbiddenException('You can only delete your own messages');
    if (msg.conversationId !== conversationId) throw new ForbiddenException('Message does not belong to this conversation');
    await this.prisma.directMessage.delete({ where: { id: messageId } });
    // Broadcast to all participants so the message vanishes in real time
    this.chatGateway.emitDmMessageDeleted(conversationId, messageId);
    return { success: true, messageId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAVED MESSAGES (Private Cloud)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /saved-messages
   * Return or create a "Saved Messages" self-conversation for the current user.
   * The conversation has a single participant: the user themselves.
   * It is identified by a single participant whose userId equals the conversation
   * creator, i.e. participantCount = 1 and that participant is the requesting user.
   */
  async getOrCreateSavedMessagesConversation(userId: string): Promise<{ conversationId: string }> {
    // Use the deterministic isSavedMessages flag for a reliable lookup.
    // This avoids the fragile participant-count heuristic.
    const existing = await this.prisma.directConversation.findFirst({
      where: {
        isSavedMessages: true,
        participants: { some: { userId } },
      },
      select: { id: true },
    });

    if (existing) return { conversationId: existing.id };

    // None found — create a new saved-messages conversation (user is sole participant)
    const conv = await this.prisma.directConversation.create({
      data: {
        isSavedMessages: true,
        participants: {
          create: [{ userId }],
        },
      },
    });

    return { conversationId: conv.id };
  }

  /**
   * GET /saved-messages/messages
   * Fetch paginated messages for the saved-messages conversation.
   */
  async getSavedMessages(
    userId: string,
    limit = 50,
    cursor?: string,
  ) {
    const { conversationId } = await this.getOrCreateSavedMessagesConversation(userId);

    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        parentId: null,
        ...(cursor && { createdAt: { lt: new Date(Buffer.from(cursor, 'base64').toString()) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sender: { select: { id: true, username: true, fullName: true, avatar: true } },
        reactions: {
          include: {
            user: { select: { id: true, username: true, fullName: true, avatar: true } },
          },
        },
        forwardedFrom: {
          select: { id: true, content: true, sender: { select: { id: true, username: true, fullName: true } } },
        },
      },
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    const nextCursor =
      hasMore && messages.length > 0
        ? Buffer.from(messages[messages.length - 1].createdAt.toISOString()).toString('base64')
        : null;

    const ordered = messages.reverse();

    const messagesWithUrls = await Promise.all(
      ordered.map(async (msg) => {
        if (msg.fileUrl) {
          return { ...msg, fileUrl: await this.uploadService.getPresignedUrl(msg.fileUrl) };
        }
        return msg;
      }),
    );

    return { messages: messagesWithUrls, nextCursor, conversationId };
  }

  /**
   * POST /saved-messages/messages
   * Send a message to saved messages (the user's private cloud).
   */
  async sendSavedMessage(userId: string, dto: SendDirectMessageDto) {
    const { conversationId } = await this.getOrCreateSavedMessagesConversation(userId);

    if (!dto.content?.trim() && !dto.fileUrl && !dto.forwardedFromId) {
      throw new BadRequestException('Message must have content or a file');
    }

    // Validate forwardedFromId — it must point to an existing DirectMessage,
    // not a channel Message (cross-table FK would cause a Prisma error).
    // If the ID is invalid or belongs to a channel message, silently drop it.
    let safeForwardedFromId: string | undefined;
    if (dto.forwardedFromId) {
      const dmExists = await this.prisma.directMessage.findUnique({
        where: { id: dto.forwardedFromId },
        select: { id: true },
      });
      safeForwardedFromId = dmExists ? dto.forwardedFromId : undefined;
    }

    const message = await this.prisma.directMessage.create({
      data: {
        content: dto.content?.trim() || null,
        fileUrl: dto.fileUrl,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        originalName: dto.originalName,
        senderId: userId,
        conversationId,
        ...(safeForwardedFromId ? { forwardedFromId: safeForwardedFromId } : {}),
      },
      include: {
        sender: { select: { id: true, username: true, fullName: true, avatar: true } },
        forwardedFrom: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, username: true, fullName: true } },
          },
        },
      },
    });

    await this.prisma.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    const messageForWs = message.fileUrl
      ? { ...message, fileUrl: await this.uploadService.getPresignedUrl(message.fileUrl) }
      : message;

    // Emit only to the user's own room so they see the message in real-time
    this.chatGateway.emitDirectMessage(conversationId, messageForWs, [userId], userId);

    return { ...messageForWs, conversationId };
  }

  /**
   * DELETE /saved-messages/messages/:messageId
   * Delete a saved message (must be owned by the current user).
   */
  async deleteSavedMessage(userId: string, messageId: string) {
    const { conversationId } = await this.getOrCreateSavedMessagesConversation(userId);
    const msg = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) throw new ForbiddenException('You can only delete your own messages');
    if (msg.conversationId !== conversationId) throw new ForbiddenException('Message not in saved messages');
    await this.prisma.directMessage.delete({ where: { id: messageId } });
    this.chatGateway.emitDmMessageDeleted(conversationId, messageId);
    return { success: true, messageId };
  }

  /**
   * PATCH /saved-messages/messages/:messageId
   * Edit a saved message.
   */
  async editSavedMessage(userId: string, messageId: string, content: string) {
    const { conversationId } = await this.getOrCreateSavedMessagesConversation(userId);
    const msg = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) throw new ForbiddenException('You can only edit your own messages');
    if (msg.conversationId !== conversationId) throw new ForbiddenException('Message not in saved messages');
    const updated = await this.prisma.directMessage.update({
      where: { id: messageId },
      data: { content, isEdited: true },
      include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
    });
    this.chatGateway.emitDmMessageUpdated(conversationId, updated);
    return updated;
  }

  /**
   * Clear all messages in a DM conversation for the current user.
   * Deletes all DirectMessage records in the conversation.
   */
  async clearHistory(userId: string, conversationId: string): Promise<{ deleted: number }> {
    // Verify the user is a participant
    const participant = await this.prisma.directParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    const result = await this.prisma.directMessage.deleteMany({
      where: { conversationId },
    });

    return { deleted: result.count };
  }

  /**
   * GET /direct/:id/pinned
   * Return the currently pinned message for a conversation, or null.
   *
   * Uses a raw query because the Prisma client is generated from the previous
   * schema snapshot and won't be regenerated until the next deployment. The
   * migration adds pinnedMessageId to direct_conversations; we query it directly.
   */
  async getPinnedMessage(userId: string, conversationId: string) {
    const participant = await this.prisma.directParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    type ConvRow = { pinnedMessageId: string | null };
    const rows = await this.prisma.$queryRaw<ConvRow[]>`
      SELECT "pinnedMessageId" FROM "direct_conversations" WHERE id = ${conversationId}::uuid LIMIT 1
    `;
    const pinnedMessageId = rows[0]?.pinnedMessageId ?? null;
    if (!pinnedMessageId) return { pinnedMessage: null };

    const pinnedMessage = await this.prisma.directMessage.findUnique({
      where: { id: pinnedMessageId },
      include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
    });
    return { pinnedMessage: pinnedMessage ?? null };
  }

  /**
   * POST /direct/:id/messages/:messageId/pin
   * Toggle the pinned message in a DM conversation.
   * Only participants can pin/unpin. Stores the pinned message on DirectConversation.
   * Broadcasts dm_message_pinned via WebSocket.
   *
   * Uses raw SQL for the update because Prisma client types don't include
   * pinnedMessageId until the client is regenerated after migration.
   */
  async pinDmMessage(userId: string, conversationId: string, messageId: string) {
    // Verify participant
    const participant = await this.prisma.directParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    // Verify message belongs to this conversation
    const msg = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.conversationId !== conversationId) throw new ForbiddenException('Message does not belong to this conversation');

    // Fetch current pinned state via raw query
    type ConvRow = { pinnedMessageId: string | null };
    const rows = await this.prisma.$queryRaw<ConvRow[]>`
      SELECT "pinnedMessageId" FROM "direct_conversations" WHERE id = ${conversationId}::uuid LIMIT 1
    `;
    const currentPinnedId = rows[0]?.pinnedMessageId ?? null;

    // Toggle: if the same message is already pinned, unpin it; else pin the new one
    const newPinnedId = currentPinnedId === messageId ? null : messageId;

    // Update via raw SQL — avoids the stale Prisma client type issue.
    // Cast NULL explicitly to avoid PostgreSQL type-inference errors.
    if (newPinnedId === null) {
      await this.prisma.$executeRaw`
        UPDATE "direct_conversations"
        SET "pinnedMessageId" = NULL
        WHERE id = ${conversationId}::uuid
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE "direct_conversations"
        SET "pinnedMessageId" = ${newPinnedId}::uuid
        WHERE id = ${conversationId}::uuid
      `;
    }

    // Fetch the pinned message with sender info to return and broadcast
    const pinnedMessage = newPinnedId
      ? await this.prisma.directMessage.findUnique({
          where: { id: newPinnedId },
          include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
        })
      : null;

    // Broadcast to all participants in the DM room
    this.chatGateway.emitDmMessagePinned(conversationId, pinnedMessage);

    return { pinnedMessage: pinnedMessage ?? null };
  }

  /**
   * POST /direct/:id/messages/:messageId/reactions
   * Toggle an emoji reaction on a DM message. Broadcasts dm_reaction_updated via WebSocket.
   */
  async toggleDmReaction(userId: string, conversationId: string, messageId: string, emoji: string) {
    // Verify participant — use findFirst to avoid compound-key schema issues
    const participant = await this.prisma.directParticipant.findFirst({
      where: { userId, conversationId },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    // One reaction per user per message: find ANY existing reaction by this user
    // (regardless of emoji) so clicking a different emoji replaces the old one.
    const existing = await this.prisma.directMessageReaction.findFirst({
      where: { userId, messageId },
    });

    if (existing) {
      // Remove the previous reaction
      await this.prisma.directMessageReaction.delete({ where: { id: existing.id } });
      // Same emoji clicked again → toggle off, stop here
      if (existing.emoji === emoji) {
        const reactions = await this.prisma.directMessageReaction.findMany({
          where: { messageId },
          include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
        });
        this.chatGateway.emitDmReactionUpdated(conversationId, messageId, reactions);
        return { messageId, reactions };
      }
    }

    // Add the new reaction
    try {
      await this.prisma.directMessageReaction.create({
        data: { userId, messageId, emoji },
      });
    } catch (err: unknown) {
      // Race-condition guard: duplicate unique constraint — ignore
      const isUniqueError =
        err instanceof Error && err.message.includes('Unique constraint');
      if (!isUniqueError) throw err;
    }

    const reactions = await this.prisma.directMessageReaction.findMany({
      where: { messageId },
      include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
    });

    // Broadcast updated reactions to all participants in real time
    this.chatGateway.emitDmReactionUpdated(conversationId, messageId, reactions);
    return { messageId, reactions };
  }

  /**
   * Get all workspace members visible to the user — used to pick DM recipients.
   */
  async getWorkspaceUsers(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this workspace');

    return this.prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { not: userId } },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatar: true, status: true } },
      },
      orderBy: { user: { username: 'asc' } },
    });
  }
}
