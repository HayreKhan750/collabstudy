import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException, InternalServerErrorException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { ChannelsService } from '../channels/channels.service';
import { ChatGateway } from '../chat/chat.gateway';
import { Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { UploadService } from '../upload/upload.service';
import { EMBEDDINGS_QUEUE, EmbeddingJobData } from '../ai/embeddings.queue';
import { UsersService } from '../users/users.service';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private prisma: PrismaService,
    private channelsService: ChannelsService,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
    private aiService: AiService,
    private uploadService: UploadService,
    @InjectQueue(EMBEDDINGS_QUEUE)
    private embeddingsQueue: Queue<EmbeddingJobData>,
    private usersService: UsersService,
  ) {}

  /**
   * Create a message in a channel (optionally a threaded reply via parentId).
   * Only workspace members can post.
   */
  async create(userId: string, channelId: string, createMessageDto: CreateMessageDto) {
    try {
    // Verify user has access to the channel
    await this.channelsService.verifyChannelAccess(userId, channelId);

    // If this is a reply, validate the parent exists and belongs to the same channel
    // Sanitise parentId — guard against the string "none" or "" being sent
    // instead of a proper UUID (would cause `parentId IS NULL` filter to miss it).
    const parentId =
      createMessageDto.parentId && createMessageDto.parentId !== 'none' && createMessageDto.parentId !== ''
        ? createMessageDto.parentId
        : undefined;

    if (parentId) {
      const parent = await this.prisma.message.findUnique({
        where: { id: parentId },
        select: { id: true, channelId: true },
      });

      if (!parent) {
        throw new NotFoundException('Parent message not found');
      }

      if (parent.channelId !== channelId) {
        throw new NotFoundException('Parent message does not belong to this channel');
      }
    }

    // Create the message
    const message = await this.prisma.message.create({
      data: {
        content: createMessageDto.content ?? null,
        userId,
        channelId,
        ...(parentId && { parentId }),
        ...(createMessageDto.mentionIds?.length && {
          mentions: {
            connect: createMessageDto.mentionIds.map((id) => ({ id })),
          },
        }),
        ...(createMessageDto.fileUrl && { fileUrl: createMessageDto.fileUrl }),
        ...(createMessageDto.fileType && { fileType: createMessageDto.fileType }),
        ...(createMessageDto.fileSize && { fileSize: createMessageDto.fileSize }),
        ...(createMessageDto.originalName && { originalName: createMessageDto.originalName }),
        ...(createMessageDto.forwardedFromId && { forwardedFromId: createMessageDto.forwardedFromId }),
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true, avatar: true },
        },
        reactions: true,
        mentions: {
          select: { id: true, username: true, fullName: true, avatar: true },
        },
        _count: { select: { replies: true } },
        forwardedFrom: {
          select: {
            id: true,
            content: true,
            user: { select: { id: true, username: true, fullName: true } },
          },
        },
      },
    });

    // Phase 11.1: Enqueue async embedding generation (fire-and-forget).
    // Only embed messages that have text content — file-only messages are skipped
    // inside the worker, but we avoid the queue round-trip entirely here.
    if (message.content?.trim()) {
      await this.embeddingsQueue.add(
        'generate',
        { messageId: message.id, content: message.content },
        // jobId deduplication: if the same message is somehow enqueued twice
        // (e.g., on retry), the second add is a no-op.
        { jobId: `embed-${message.id}` },
      );
    }

    // Broadcast the message via WebSocket AFTER successful persistence.
    // Swap the raw S3 key for a pre-signed URL so receivers get a usable link.
    const messageForWs = message.fileUrl
      ? { ...message, fileUrl: await this.uploadService.getPresignedUrl(message.fileUrl) }
      : message;
    this.chatGateway.emitNewMessage(channelId, messageForWs);

    // ── Per-user unread badge notifications ───────────────────────────────
    // Notify all workspace members (excluding sender) via their personal room
    // so the sidebar unread badge increments even if they don't have the
    // channel open (and thus aren't in the channel socket room).
    // Only do this for top-level messages (not thread replies).
    if (!parentId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: {
          workspaceId: true,
          workspace: {
            select: {
              members: { select: { userId: true } },
            },
          },
        },
      });
      if (channel) {
        const memberIds = channel.workspace.members.map((m) => m.userId);
        this.chatGateway.emitChannelMessageNotification(
          channelId,
          channel.workspaceId,
          userId,
          memberIds,
          message.id,
        );
      }
    }

    // ── Mention notifications ──────────────────────────────────────────────
    // If any users were mentioned, fetch channel + workspace names and emit
    // a direct `user_mentioned` notification to each mentioned user's room.
    if (createMessageDto.mentionIds?.length) {
      // Filter out the author (no self-mention toast)
      const otherMentionIds = createMessageDto.mentionIds.filter((id) => id !== userId);

      if (otherMentionIds.length > 0) {
        const channel = await this.prisma.channel.findUnique({
          where: { id: channelId },
          select: { name: true, workspace: { select: { name: true } } },
        });

        if (channel) {
          this.chatGateway.emitUserMentioned(otherMentionIds, {
            messageId: message.id,
            content: message.content ?? '',
            channelId,
            channelName: channel.name,
            workspaceName: channel.workspace.name,
            author: {
              id: message.user.id,
              username: message.user.username,
              fullName: message.user.fullName ?? null,
            },
          });

          // ── Invalidate digest cache for mentioned users ────────────────
          // Mentioned users' digests are now stale — clear so next fetch regenerates.
          await Promise.all(
            otherMentionIds.map((id) => this.usersService.invalidateDigestCache(id)),
          );
        }
      }
    }

    // ── Invalidate digest cache for all channel members (excluding sender) ──
    // Any top-level message makes their unread count stale. Fire-and-forget.
    if (!parentId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { workspace: { select: { members: { select: { userId: true } } } } },
      });
      if (channel) {
        const memberIds = channel.workspace.members.map((m) => m.userId).filter((id) => id !== userId);
        // Run invalidations in parallel, non-blocking
        Promise.all(memberIds.map((id) => this.usersService.invalidateDigestCache(id))).catch(() => {});
      }
    }

    return message;
    } catch (error: unknown) {
      // ── Structured error logging ─────────────────────────────────────────
      // Log every detail so the actual root cause is visible in NestJS logs
      // instead of a generic "Internal Server Error".
      this.logger.error('🚨 CRITICAL MESSAGE SEND ERROR 🚨', {
        userId,
        channelId,
        dto: createMessageDto,
        error,
      });

      // Re-throw NestJS HTTP exceptions as-is so the client gets the correct
      // status code (403, 404, etc.) rather than a 500.
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // For Prisma / unexpected errors: surface the real message to the client
      // so it is visible in the browser console during debugging.
      const message =
        error instanceof Error ? error.message : 'Unknown error during message creation';
      throw new InternalServerErrorException(
        `Message creation failed: ${message}`,
      );
    }
  }

  /**
   * Toggle a pin on a message in a channel.
   * Any workspace member can pin/unpin messages.
   */
  async togglePin(userId: string, channelId: string, messageId: string) {
    await this.channelsService.verifyChannelAccess(userId, channelId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, isPinned: true },
    });

    if (!message || message.channelId !== channelId) {
      throw new NotFoundException('Message not found');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: !message.isPinned },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatar: true } },
        reactions: true,
        _count: { select: { replies: true } },
        forwardedFrom: {
          select: { id: true, content: true, user: { select: { id: true, username: true, fullName: true } } },
        },
      },
    });

    // Broadcast the updated message so all clients show the pin indicator
    this.chatGateway.emitMessageUpdated(channelId, updated as any);

    return { messageId, isPinned: updated.isPinned };
  }

  /**
   * Get messages for a channel with pagination.
   * - If parentId is provided: return only replies to that parent (thread view).
   * - If parentId is omitted: return only top-level messages (parentId IS NULL).
   * Only workspace members can read.
   * Sorted by createdAt ASC (oldest first for chat).
   */
  async findAllByChannel(
    userId: string,
    channelId: string,
    limit: number = 50,
    cursor?: string,
    parentId?: string,
  ) {
    // Verify user has access to the channel
    await this.channelsService.verifyChannelAccess(userId, channelId);

    // Build query with pagination.
    // When no cursor is provided (initial load), fetch the LATEST `limit`
    // messages by sorting DESC and reversing — so the user always sees the
    // most recent messages rather than the oldest N.
    // When a cursor IS provided (loading older history), sort ASC from cursor.
    const isInitialLoad = !cursor;

    const whereClause = { channelId, parentId: parentId ?? null };
    const include = {
      user: { select: { id: true, username: true, fullName: true, avatar: true } },
      reactions: {
        include: {
          user: { select: { id: true, username: true, fullName: true, avatar: true } },
        },
      },
      mentions: { select: { id: true, username: true, fullName: true, avatar: true } },
      _count: { select: { replies: true } },
      forwardedFrom: {
        select: { id: true, content: true, user: { select: { id: true, username: true, fullName: true } } },
      },
    } as const;

    // Both initial load and paginated load use DESC so we always walk
    // backwards in time from the anchor point.
    // - Initial load: no cursor → newest `limit` messages.
    // - Paginated load: cursor = oldest message currently on screen →
    //   `limit` messages older than that, skipping the cursor itself.
    const raw = await this.prisma.message.findMany({
      where: whereClause,
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include,
    });

    // Reverse so the oldest is first (chronological order for rendering).
    const ordered = [...raw].reverse();

    // Fetch the requesting user's lastReadAt for this channel so the frontend
    // can render the "Unread messages" divider at the correct position.
    const channelMember = await this.prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId } },
      select: { lastReadAt: true },
    });

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
      // nextCursor points at the oldest message in this batch so the next
      // paginated request fetches messages older than it.
      nextCursor: raw.length === limit ? ordered[0].id : null,
      // ISO string, or null if the user has never read this channel
      lastReadAt: channelMember?.lastReadAt?.toISOString() ?? null,
    };
  }

  /**
   * Add a reaction to a message.
   * User must be a member of the workspace that owns the channel.
   * Each user can only react with the same emoji once per message (unique constraint).
   */
  async addReaction(userId: string, channelId: string, messageId: string, addReactionDto: AddReactionDto) {
    // First verify the user has access to the channel (validates membership before any message lookup)
    await this.channelsService.verifyChannelAccess(userId, channelId);

    // Fetch the message and confirm it belongs to the declared channel
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.channelId !== channelId) {
      throw new NotFoundException('Message not found');
    }

    // Verify the user is a member of the workspace that owns this channel
    await this.channelsService.verifyChannelAccess(userId, message.channelId);

    // ── One reaction per user per message ──────────────────────────────────
    // If the user already reacted with ANY emoji on this message, remove it
    // first so each user can only have one active reaction per message.
    // If clicking the same emoji they already have → toggle it off (remove only).
    const existingReaction = await this.prisma.reaction.findFirst({
      where: { userId, messageId },
    });

    if (existingReaction) {
      // Remove the existing reaction
      await this.prisma.reaction.delete({ where: { id: existingReaction.id } });

      // Broadcast removal
      this.chatGateway.emitReactionRemoved(message.channelId, {
        reactionId: existingReaction.id,
        messageId,
        userId,
        emoji: existingReaction.emoji,
      });

      // If same emoji clicked again → it was a toggle-off, stop here
      if (existingReaction.emoji === addReactionDto.emoji) {
        return { success: true, removed: true, emoji: existingReaction.emoji };
      }
    }

    // Add the new reaction
    try {
      const reaction = await this.prisma.reaction.create({
        data: {
          emoji: addReactionDto.emoji,
          userId,
          messageId,
        },
        include: {
          user: {
            select: { id: true, username: true, fullName: true, avatar: true },
          },
        },
      });

      // Broadcast to the channel room
      this.chatGateway.emitReactionAdded(message.channelId, {
        ...reaction,
        channelId: message.channelId,
      });

      return reaction;
    } catch (error: unknown) {
      // Prisma unique constraint violation code — race condition guard
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('You have already reacted with this emoji');
      }
      throw error;
    }
  }

  /**
   * Remove a reaction from a message.
   * Only the user who added the reaction can remove it.
   */
  async removeReaction(userId: string, reactionId: string) {
    const reaction = await this.prisma.reaction.findUnique({
      where: { id: reactionId },
      include: {
        message: { select: { id: true, channelId: true } },
      },
    });

    if (!reaction) {
      throw new NotFoundException('Reaction not found');
    }

    if (reaction.userId !== userId) {
      throw new ForbiddenException('You can only remove your own reactions');
    }

    await this.prisma.reaction.delete({ where: { id: reactionId } });

    // Broadcast removal to the channel room
    this.chatGateway.emitReactionRemoved(reaction.message.channelId, {
      reactionId,
      messageId: reaction.messageId,
      userId,
      emoji: reaction.emoji,
    });

    return { success: true };
  }

  /**
   * GET /channels/:channelId/summary
   * Fetch the last 50 messages, format them into a text block, and return
   * a placeholder AI-generated summary. Swap the placeholder for a real
   * OpenAI / Gemini call later without touching the controller.
   */
  async getSummary(userId: string, channelId: string): Promise<{ summary: string }> {
    await this.channelsService.verifyChannelAccess(userId, channelId);

    const raw = await this.prisma.message.findMany({
      where: { channelId, parentId: null, content: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        content: true,
        createdAt: true,
        user: { select: { username: true } },
      },
    });

    if (raw.length === 0) {
      return { summary: 'No messages to summarise yet.' };
    }

    // Build a readable transcript (chronological order)
    const transcript = [...raw]
      .reverse()
      .map((m) => {
        const time = new Date(m.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
        return `[${time}] ${m.user.username}: ${m.content}`;
      })
      .join('\n');

    return { summary: await this.aiService.summarise(transcript) };
  }

  /**
   * PATCH /channels/:channelId/messages/:messageId
   * Edit a message. Only the original author can edit their own message.
   * Sets isEdited = true and emits message_updated via WebSocket.
   */
  async editMessage(userId: string, channelId: string, messageId: string, dto: { content: string }) {
    // Verify the message exists in this channel
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.userId !== userId) throw new ForbiddenException('You can only edit your own messages');

    // Use raw SQL to set isEdited=true so we are not blocked by stale Prisma
    // client type definitions (the column exists in DB via migration).
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE messages SET content = ${dto.content}, "isEdited" = true, "updatedAt" = NOW() WHERE id = ${messageId}::uuid`,
    );

    // Fetch the fully-shaped updated message for the response + WS broadcast
    const updated = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatar: true } },
        reactions: {
          include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
        },
        mentions: { select: { id: true, username: true, fullName: true, avatar: true } },
        _count: { select: { replies: true } },
      },
    });

    // Presign any file attachment so the WS broadcast carries a usable URL.
    // NOTE: emitMessageUpdated is called from MessagesController after this
    // returns, to avoid circular dependency issues with the ChatGateway injection.
    const presignedFileUrl =
      updated?.fileUrl ? await this.uploadService.getPresignedUrl(updated.fileUrl) : updated?.fileUrl;

    return { ...updated, isEdited: true, fileUrl: presignedFileUrl ?? null };
  }

  /**
   * DELETE /channels/:channelId/messages/:messageId
   * Hard-delete a message. Only the original author can delete their own message.
   * Emits message_deleted via WebSocket.
   */
  async deleteMessage(userId: string, channelId: string, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.userId !== userId) throw new ForbiddenException('You can only delete your own messages');

    await this.prisma.message.delete({ where: { id: messageId } });

    // NOTE: emitMessageDeleted is called from MessagesController after this returns.
    return { success: true, messageId };
  }

  /**
   * POST /channels/:channelId/messages/:messageId/save
   * Toggle save (bookmark) a message for the current user.
   */
  async saveMessage(userId: string, messageId: string): Promise<{ saved: boolean }> {
    const existing = await this.prisma.savedMessage.findUnique({
      where: { userId_messageId: { userId, messageId } },
    });
    if (existing) {
      await this.prisma.savedMessage.delete({ where: { id: existing.id } });
      return { saved: false };
    }
    await this.prisma.savedMessage.create({ data: { userId, messageId } });
    return { saved: true };
  }
}
