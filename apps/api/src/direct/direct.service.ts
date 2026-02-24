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

@Injectable()
export class DirectService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly aiService: AiService,
    private readonly uploadService: UploadService,
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
  ) {
    // Verify membership
    const participant = await this.prisma.directParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');

    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        ...(cursor && { createdAt: { lt: new Date(Buffer.from(cursor, 'base64').toString()) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sender: { select: { id: true, username: true, fullName: true, avatar: true } },
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

    if (!dto.content?.trim() && !dto.fileUrl) {
      throw new BadRequestException('Message must have content or a file');
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
      },
      include: {
        sender: { select: { id: true, username: true, fullName: true, avatar: true } },
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
